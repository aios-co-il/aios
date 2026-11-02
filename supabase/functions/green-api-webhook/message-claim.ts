// Green API can deliver one message event more than once. green-api-webhook
// claims each delivery's idMessage before anything runs, so a redelivery is
// dropped instead of storing, mirroring or dispatching the message twice.
import { serviceClient } from "../_shared/supabase-clients.ts";
import {
  takeOverStaleClaim,
  type ClaimDb,
  type ClaimMatch,
} from "./message-claim-lease.ts";

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
  /** The Green line (tenant_integrations.id) that received the delivery. */
  integrationId: string;
  idMessage: unknown;
};

/**
 * Claims one delivery of a Green API message for the line that received it, in
 * processed_webhook_messages (unique on provider, tenant_id,
 * external_message_id). Keyed by the line, not its user: two lines of a tenant
 * in one group each store the message, even when neither has a user_id. The
 * claim is a lease: a duplicate takes over only an unfinished claim older than
 * MESSAGE_CLAIM_LEASE_MS. A claim insert that fails for another reason
 * processes the message unclaimed rather than lose it. `db` and `now` default
 * to the typed service client and the clock; tests pass fakes.
 */
export async function claimWebhookMessage(
  key: MessageClaimKey,
  db: ClaimDb = serviceClient(),
  now: () => number = Date.now,
): Promise<WebhookMessageClaim> {
  const idMessage =
    typeof key.idMessage === "string" ? key.idMessage.trim() : "";
  if (!key.tenantId || !key.integrationId || !idMessage) {
    return UNCLAIMED;
  }
  const match: ClaimMatch = {
    provider: MESSAGE_CLAIM_PROVIDER,
    tenant_id: key.tenantId,
    external_message_id: `${key.integrationId}:${idMessage}`,
  };
  // processed_at is written here, not defaulted, so the claim can be fenced on
  // it (ownedClaim).
  const claimedAt = new Date(now()).toISOString();
  const { error } = await db
    .from("processed_webhook_messages")
    .insert({ ...match, processed_at: claimedAt });
  if (!error) {
    return ownedClaim(db, match, claimedAt);
  }
  // 23505 = unique_violation: another delivery holds this message's claim.
  if (error.code !== "23505") {
    console.error("[green-api] message claim failed (continuing)", {
      idMessage,
      error,
    });
    return UNCLAIMED;
  }
  const takenAt = await takeOverStaleClaim(db, match, now());
  if (takenAt) {
    console.warn("[green-api] took over stale message claim", { idMessage });
    return ownedClaim(db, match, takenAt);
  }
  console.log("[green-api] duplicate webhook dropped", { idMessage });
  return DUPLICATE;
}

/** processed_webhook_messages.provider of a Green API message claim. */
export const MESSAGE_CLAIM_PROVIDER = "green_api";

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

/**
 * The claim this delivery holds: completed once, released only if unfinished.
 * Both are fenced on the processed_at this delivery wrote, so a delivery that
 * outlived its lease cannot complete or delete the claim of the retry that took
 * it over.
 */
function ownedClaim(
  db: ClaimDb,
  match: ClaimMatch,
  claimedAt: string,
): WebhookMessageClaim {
  const fenced = { ...match, processed_at: claimedAt };
  let completed = false;
  return {
    duplicate: false,
    async complete() {
      if (completed) {
        return;
      }
      completed = true;
      const { data, error } = await db
        .from("processed_webhook_messages")
        .update({ completed_at: new Date().toISOString() })
        .match(fenced)
        .select("external_message_id");
      if (error) {
        console.error("[green-api] failed to complete message claim", {
          match,
          error,
        });
      } else if ((data?.length ?? 0) === 0) {
        console.warn("[green-api] message claim was taken over before done", {
          match,
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
        .match(fenced)
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
