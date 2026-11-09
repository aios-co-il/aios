import { type ToolRoute } from "../route.ts";
import { legacySearchConversationHistoryRoute } from "../legacy-search-conversation-history.ts";

/** conversation tool routes; argument assertions retain the legacy tool boundary. */
export const conversationRoutes: Record<string, ToolRoute> = {
  search_conversation_history: legacySearchConversationHistoryRoute,
};
