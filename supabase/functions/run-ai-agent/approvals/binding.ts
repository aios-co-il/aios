import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { Json } from "../../_shared/database.types.ts";

/** Where a request was made: the inputs of its conversation key. */
export interface ConversationInput {
  surface?: string | null;
  conversationId?: string | null;
  waChatId?: string | null;
  phone?: string | null;
}

/** Stamp the requester's conversation on an approval row a tool just queued. */
export async function bindApprovalToConversation(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  approvalId: string,
  userId: string | null,
  conversation: ConversationInput,
): Promise<void> {
  const binding = approvalBindingContext(conversation);
  if (!approvalId || !userId || !binding) {
    return;
  }

  try {
    const { data: row, error } = await supabase
      .from("agent_approval_queue")
      .select("id, requested_by, context")
      .eq("id", approvalId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      console.warn("[AGENT] approval binding read failed (non-fatal):", error);
      return;
    }

    const context = mergeApprovalBinding(row, { userId, binding });
    if (!context) {
      return;
    }

    const { error: updateError } = await supabase
      .from("agent_approval_queue")
      .update({ context })
      .eq("id", approvalId)
      .eq("tenant_id", tenantId);
    if (updateError) {
      console.warn("[AGENT] approval binding failed (non-fatal):", updateError);
    }
  } catch (e) {
    console.warn("[AGENT] approval binding failed (non-fatal):", e);
  }
}

/**
 * Identity of the conversation a request was made in.
 * Command Center / internal chat: the ai_conversations id. WhatsApp: the chat id
 * (falls back to the sender's phone). Other surfaces have none, so their rows are
 * never confirmed by a bare "כן".
 */
export function approvalConversationKey({
  surface,
  conversationId,
  waChatId,
  phone,
}: ConversationInput = {}): string | null {
  if (conversationId) {
    return `conv:${conversationId}`;
  }

  if (waChatId) {
    return `wa:${waChatId}`;
  }

  if (surface === "whatsapp") {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length >= 9) {
      return `wa_phone:${digits.slice(-9)}`;
    }
  }

  return null;
}

/** Context fields stamped on a new approval row. Null when there is no conversation. */
export function approvalBindingContext(
  input: ConversationInput = {},
): { conversation_key: string; conversation_surface: string | null } | null {
  const key = approvalConversationKey(input);
  if (!key) {
    return null;
  }

  return { conversation_key: key, conversation_surface: input.surface || null };
}

/**
 * New context for a just-created row, or null when nothing should change: only the
 * requester's own row is bound, and an existing binding is never moved.
 */
export function mergeApprovalBinding(
  row: { requested_by?: string | null; context?: Json | null } | null,
  {
    userId,
    binding,
  }: {
    userId?: string | null;
    binding?: Record<string, string | null> | null;
  } = {},
): Record<string, Json | undefined> | null {
  if (!row || !binding || !userId) {
    return null;
  }

  if (row.requested_by !== userId || boundConversationKey(row)) {
    return null;
  }

  return { ...contextObject(row.context), ...binding };
}

/** The conversation_key a row was bound to, if any. */
export function boundConversationKey(
  row: { context?: Json | null } | null | undefined,
): Json | undefined {
  return contextObject(row?.context).conversation_key;
}

/** A row's context as an object ({} for null, arrays and scalars). */
function contextObject(
  context: Json | null | undefined,
): Record<string, Json | undefined> {
  return context && typeof context === "object" && !Array.isArray(context)
    ? context
    : {};
}
