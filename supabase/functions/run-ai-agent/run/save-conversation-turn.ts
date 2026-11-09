import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { ChatTurn } from "../fast-lane/answer.ts";

/** Saves the user's message and the answer to the conversation (last 60 messages). */
export async function saveConversationTurn(
  supabase: AgentDatabaseClient,
  turn: {
    tenantId: string;
    userId: string;
    conversationId: string;
    history: Array<ChatTurn>;
    message: string;
    answer: string;
  },
): Promise<void> {
  const messages = [
    ...turn.history,
    { role: "user", content: turn.message },
    { role: "assistant", content: turn.answer },
  ].slice(-60);
  const { error } = await supabase
    .from("ai_conversations")
    .update({ messages, updated_at: new Date().toISOString() })
    .eq("id", turn.conversationId)
    .eq("user_id", turn.userId)
    .eq("tenant_id", turn.tenantId);
  if (error) {
    console.error("[AGENT] conversation persistence failed:", error.message);
  }
}
