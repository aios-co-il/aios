// Green API can deliver one message event more than once. green-api-webhook
// claims each delivery's idMessage before anything runs, so a redelivery is
// dropped instead of storing, mirroring or dispatching the message twice.
import { serviceClient, type DbClient } from "../_shared/supabase-clients.ts";

export type WebhookMessageClaim = {
  /** Another delivery of this message holds the claim: drop this one. */
  duplicate: boolean;
  /** Marks the claim done once the message is stored, so a retry is a duplicate. */
  complete(): Promise<void>;
  /** Frees an unfinished claim after a failure, so Green API's retry is handled. */
  release(): Promise<void>;
};

export type MessageClaimKey = {
  tenantId: string;
  connectionUserId: string | null;
  idMessage: unknown;
};

type ClaimDb = Pick<DbClient, "from">;

type ClaimMatch = {
  provider: string;
  tenant_id: string;
  external_message_id: string;
};

/**
 * Claims one delivery of a Green API message for its connection, in
 * processed_webhook_messages (unique on provider, tenant_id,
 * external_message_id). The claim is a lease: a duplicate takes over only an
 * unfinished claim older than MESSAGE_CLAIM_LEASE_MS. A claim insert that fails
 * for another reason processes the message unclaimed rather than lose it.
 * `db` defaults to the typed service client; tests pass a fake.
 */
export async function claimWebhookMessage(
  key: MessageClaimKey,
  db: ClaimDb = serviceClient(),
): Promise<WebhookMessageClaim> {
  const idMessage =
    typeof key.idMessage === "string" ? key.idMessage.trim() : "";
  if (!key.tenantId || !idMessage) {
    return UNCLAIMED;
  }
  const match: ClaimMatch = {
    provider: MESSAGE_CLAIM_PROVIDER,
    tenant_id: key.tenantId,
    external_message_id: `${key.connectionUserId ?? "none"}:${idMessage}`,
  };
  const { error } = await db.from("processed_webhook_messages").insert(match);
  if (!error) {
    return ownedClaim(db, match);
  }
  // 23505 = unique_violation: another delivery holds this message's claim.
  if (error.code !== "23505") {
    console.error("[green-api] message claim failed (continuing)", {
      idMessage,
      error,
    });
    return UNCLAIMED;
  }
  if (await takeOverStaleClaim(db, match, Date.now())) {
    console.warn("[green-api] took over stale message claim", { idMessage });
    return ownedClaim(db, match);
  }
  console.log("[green-api] duplicate webhook dropped", { idMessage });
  return DUPLICATE;
}

/** processed_webhook_messages.provider of a Green API message claim. */
export const MESSAGE_CLAIM_PROVIDER = "green_api";

/**
 * An unfinished claim older than this belongs to a delivery that died mid-way
 * (timeout, redeploy), so Green API's retry may take it over.
 */
export const MESSAGE_CLAIM_LEASE_MS = 5 * 60_000;

/** True when a claim was never completed and its lease has run out. */
export function isClaimLeaseExpired(
  claim: { processed_at: string | null; completed_at: string | null },
  nowMs: number,
  leaseMs: number = MESSAGE_CLAIM_LEASE_MS,
): boolean {
  if (claim.completed_at) {
    return false;
  }
  const claimedAt = claim.processed_at ? Date.parse(claim.processed_at) : NaN;
  return Number.isNaN(claimedAt) || nowMs - claimedAt >= leaseMs;
}

const noop = () => Promise.resolve();
const UNCLAIMED: WebhookMessageClaim = {
  duplicate: false,
  complete: noop,
  release: noop,
};
const DUPLICATE: WebhookMessageClaim = {
  duplicate: true,
  complete: noop,
  release: noop,
};

/** The claim this delivery holds: completed once, released only if unfinished. */
function ownedClaim(db: ClaimDb, match: ClaimMatch): WebhookMessageClaim {
  let completed = false;
  return {
    duplicate: false,
    async complete() {
      if (completed) {
        return;
      }
      completed = true;
      const { error } = await db
        .from("processed_webhook_messages")
        .update({ completed_at: new Date().toISOString() })
        .match(match);
      if (error) {
        console.error("[green-api] failed to complete message claim", {
          match,
          error,
        });
      }
    },
    async release() {
      if (completed) {
        return;
      }
      const { error } = await db
        .from("processed_webhook_messages")
        .delete()
        .match(match)
        .is("completed_at", null);
      if (error) {
        console.error("[green-api] failed to release message claim", {
          match,
          error,
        });
      }
    },
  };
}

/**
 * Takes over a stale claim with a compare-and-set on processed_at, so of two
 * retries racing for it only one wins.
 */
async function takeOverStaleClaim(
  db: ClaimDb,
  match: ClaimMatch,
  nowMs: number,
): Promise<boolean> {
  const { data: existing, error } = await db
    .from("processed_webhook_messages")
    .select("processed_at, completed_at")
    .match(match)
    .maybeSingle();
  if (error) {
    console.error("[green-api] message claim lookup failed", { match, error });
    return false;
  }
  if (!existing || !isClaimLeaseExpired(existing, nowMs)) {
    return false;
  }
  const { data: taken, error: takeError } = await db
    .from("processed_webhook_messages")
    .update({ processed_at: new Date(nowMs).toISOString() })
    .match({ ...match, processed_at: existing.processed_at })
    .is("completed_at", null)
    .select("external_message_id");
  if (takeError) {
    console.error("[green-api] stale message claim takeover failed", {
      match,
      error: takeError,
    });
    return false;
  }
  return (taken?.length ?? 0) > 0;
}
