/** The claude_session_messages reads and writes behind Claude Direct follow-ups (AIO-600). */
import type { DbClient } from "../supabase-clients.ts";
import type { FollowupStore, MessageStatus } from "./claude-session.ts";

/** The conversation whose cloud session a message belongs to. */
export type SessionScope = { tenantId: string; conversationId: string };

/**
 * The cloud session this conversation's last delivered message went into, when that was
 * recent enough to continue. Null starts a new session.
 */
export async function findOpenCloudSession(
  sb: DbClient,
  scope: SessionScope,
  idleLimitMs: number,
  now = Date.now(),
): Promise<string | null> {
  const { data, error } = await sb
    .from("claude_session_messages")
    .select("cloud_session_id, created_at")
    .eq("tenant_id", scope.tenantId)
    .eq("conversation_id", scope.conversationId)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`open cloud session lookup: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return now - Date.parse(data.created_at) <= idleLimitMs
    ? data.cloud_session_id
    : null;
}

/** Records the session a routine fire opened, so the next message can continue it. */
export async function recordOpenedCloudSession(
  sb: DbClient,
  scope: SessionScope,
  cloudSessionId: string,
): Promise<void> {
  const { error } = await sb.from("claude_session_messages").insert({
    tenant_id: scope.tenantId,
    conversation_id: scope.conversationId,
    cloud_session_id: cloudSessionId,
    via: "routine",
    status: "sent",
    finished_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`record cloud session: ${error.message}`);
  }
}

/** The follow-up queue of one conversation's open cloud session. */
export function followupStore(
  sb: DbClient,
  scope: SessionScope,
  cloudSessionId: string,
): FollowupStore {
  /** Moves a row out of one status; true when this call moved it. */
  async function close(
    id: string,
    from: MessageStatus,
    to: MessageStatus,
    reason: string,
  ): Promise<boolean> {
    const { data, error } = await sb
      .from("claude_session_messages")
      .update({
        status: to,
        prompt: null,
        error: reason,
        finished_at: new Date().toISOString(),
      })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .eq("status", from)
      .select("id");
    if (error) {
      throw new Error(`close follow-up: ${error.message}`);
    }
    return data.length > 0;
  }
  return {
    queue: async (prompt) => {
      const { data, error } = await sb
        .from("claude_session_messages")
        .insert({
          tenant_id: scope.tenantId,
          conversation_id: scope.conversationId,
          cloud_session_id: cloudSessionId,
          via: "worker",
          status: "queued",
          prompt,
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(`queue follow-up: ${error.message}`);
      }
      return data.id;
    },
    status: async (id) => {
      const { data, error } = await sb
        .from("claude_session_messages")
        .select("status")
        .eq("tenant_id", scope.tenantId)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`follow-up status: ${error.message}`);
      }
      return isMessageStatus(data?.status) ? data.status : null;
    },
    cancelQueued: (id) =>
      close(id, "queued", "cancelled", "no worker claimed it in time"),
    failSending: (id) =>
      close(id, "sending", "failed", "the worker gave no verdict in time"),
  };
}

const STATUSES: ReadonlyArray<string> = [
  "queued",
  "sending",
  "sent",
  "failed",
  "cancelled",
];

/** Narrows a stored status to the known ones. */
function isMessageStatus(value: unknown): value is MessageStatus {
  return typeof value === "string" && STATUSES.includes(value);
}
