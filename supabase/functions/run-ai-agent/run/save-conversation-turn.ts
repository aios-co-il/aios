import { savedTurnMessages } from "../device-turn/saved-turn.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { ChatTurn } from "../fast-lane/answer.ts";

/** Saves the last 60 messages, joining a continuation answer to its paused turn. */
export async function saveConversationTurn(
  supabase: DbClient,
  turn: {
    tenantId: string;
    userId: string;
    conversationId: string;
    history: Array<ChatTurn>;
    message: string | null;
    answer: string;
  },
): Promise<void> {
  const messages = savedTurnMessages(turn.history, turn.message, turn.answer);
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
