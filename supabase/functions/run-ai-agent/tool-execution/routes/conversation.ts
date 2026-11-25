import { type ToolRoute } from "../route.ts";
import { legacySearchConversationHistoryRoute } from "../legacy-search-conversation-history.ts";

export const conversationRoutes: Record<string, ToolRoute> = {
  search_conversation_history: legacySearchConversationHistoryRoute,
};
