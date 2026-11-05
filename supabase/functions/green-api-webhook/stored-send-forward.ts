// A Green API send stored before its echo (an automation send or a Carmen
// fallback reply, _shared/client-card/system-send.ts) still owes the
// team-channel mirror its echo used to do. The echo claims that mirror once,
// so a redelivered echo never repeats it.
import type { DbClient } from "../_shared/supabase-clients.ts";
import { isRecord } from "../_shared/client-card/is-record.ts";
import { TEAM_FORWARD_PENDING } from "../_shared/client-card/system-send.ts";

/** raw_provider_data.team_forward once the echo has claimed the mirror. */
export const TEAM_FORWARD_DONE = "done";

export type StoredSendForward = {
  supabaseClient: Pick<DbClient, "from">;
  tenantId: string;
  connectionUserId: string | null | undefined;
  idMessage: unknown;
  webhookData: {
    senderData?: { chatId?: string; senderName?: string | null } | null;
    messageData?: unknown;
  };
  connectionDisplayName: string | null;
  /** index.ts's forwardToTeamChannels, passed in so a test can see the mirror. */
  forwardToTeamChannels(
    supabaseClient: Pick<DbClient, "from">,
    tenantId: string,
    connectionUserId: string,
    chatId: string | undefined,
    senderName: string | null,
    messageText: string,
    messageData: unknown,
    whatsappGroupId: string | null,
  ): Promise<void>;
};

export type StoredSendTeamForward = {
  id: string;
  groupId: string | null;
  messageText: string;
};

/**
 * Mirrors the stored send this echo duplicates to its linked team channels,
 * when this echo is the one that claims the mirror. A group row is mirrored
 * under the connection's name, a private one under the echo's sender name.
 */
export async function forwardStoredSend(ctx: StoredSendForward): Promise<void> {
  const stored = await claimStoredSendTeamForward(ctx.supabaseClient, {
    tenantId: ctx.tenantId,
    connectionUserId: ctx.connectionUserId,
    idMessage: ctx.idMessage,
  });
  if (!stored || !ctx.connectionUserId) {
    return;
  }
  await ctx.forwardToTeamChannels(
    ctx.supabaseClient,
    ctx.tenantId,
    ctx.connectionUserId,
    ctx.webhookData.senderData?.chatId,
    stored.groupId
      ? ctx.connectionDisplayName
      : ctx.webhookData.senderData?.senderName || null,
    stored.messageText,
    ctx.webhookData.messageData,
    stored.groupId,
  );
}

/**
 * Claims the team-channel mirror of a Green API send stored before its echo
 * (team_forward "pending"): flips it to "done" and returns the row only for
 * the call that flipped it. Null when nothing is owed. Never throws.
 */
export async function claimStoredSendTeamForward(
  db: Pick<DbClient, "from">,
  key: {
    tenantId: string;
    connectionUserId: string | null | undefined;
    idMessage: unknown;
  },
): Promise<StoredSendTeamForward | null> {
  const idMessage =
    typeof key.idMessage === "string" ? key.idMessage.trim() : "";
  if (!key.tenantId || !key.connectionUserId || !idMessage) {
    return null;
  }
  try {
    // PostgREST cannot merge jsonb, so the row is read first; the
    // team_forward filter on the update is what makes the claim atomic.
    const { data: stored, error } = await db
      .from("chat_messages")
      .select("id, group_id, message_text, raw_provider_data")
      .eq("tenant_id", key.tenantId)
      .eq("connection_user_id", key.connectionUserId)
      .eq("raw_provider_data->>idMessage", idMessage)
      .eq("raw_provider_data->>team_forward", TEAM_FORWARD_PENDING)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[green-api-webhook] stored send lookup failed", {
        tenantId: key.tenantId,
        error,
      });
      return null;
    }
    if (typeof stored?.id !== "string") {
      return null;
    }
    const raw = isRecord(stored.raw_provider_data)
      ? stored.raw_provider_data
      : {};
    const { data: claimed, error: claimError } = await db
      .from("chat_messages")
      .update({
        raw_provider_data: { ...raw, team_forward: TEAM_FORWARD_DONE },
      })
      .eq("id", stored.id)
      .eq("raw_provider_data->>team_forward", TEAM_FORWARD_PENDING)
      .select("id");
    if (claimError) {
      console.error("[green-api-webhook] team forward claim failed", {
        tenantId: key.tenantId,
        error: claimError,
      });
      return null;
    }
    if (!Array.isArray(claimed) || claimed.length === 0) {
      return null;
    }
    return {
      id: stored.id,
      groupId: typeof stored.group_id === "string" ? stored.group_id : null,
      messageText:
        typeof stored.message_text === "string" ? stored.message_text : "",
    };
  } catch (err) {
    console.error("[green-api-webhook] team forward claim failed", String(err));
    return null;
  }
}
