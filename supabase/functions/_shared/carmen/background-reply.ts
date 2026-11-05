/**
 * Carmen's chat answer is saved by the server, so it survives a closed chat
 * panel or a reloaded tab: run-ai-agent records the streamed text and, once
 * the turn ends, writes it as the conversation's assistant message and marks
 * the conversation idle. The client sends the same reply_key when it persists
 * the answer itself, so the two writes never duplicate.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  insertMessage,
  setConversationStatus,
} from "../agent-channel/store.ts";

export { createReplyRecorder, parseReplyKey } from "./reply-recorder.ts";

/**
 * Saves the answer (when there is one) and marks the conversation idle.
 * conversationId must be the one run-ai-agent resolved for this user.
 */
export async function saveCarmenReply(
  sb: SupabaseClient,
  args: { conversationId: string; content: string; replyKey: string | null },
): Promise<void> {
  const { data: conv } = await sb
    .from("ai_conversations")
    .select("tenant_id")
    .eq("id", args.conversationId)
    .maybeSingle();
  if (!conv?.tenant_id) return;
  if (args.content.trim()) {
    await insertMessage(sb, {
      tenant_id: conv.tenant_id,
      conversation_id: args.conversationId,
      role: "assistant",
      speaker: "carmen",
      channel: "internal",
      content: args.content,
      idempotency_key: args.replyKey,
      metadata: {
        origin: "internal",
        delivery_mode: "text",
        saved_by: "server",
      },
    });
  }
  await setConversationStatus(sb, args.conversationId, "idle");
}
