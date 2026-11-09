import { type ToolRoute } from "../route.ts";
import { legacyGetChatHistoryRoute } from "../legacy-get-chat-history.ts";
import { legacyGetRecentInboundMessagesRoute } from "../legacy-get-recent-inbound-messages.ts";

/** readers tool routes; argument assertions retain the legacy tool boundary. */
export const readersRoutes: Record<string, ToolRoute> = {
  get_chat_history: legacyGetChatHistoryRoute,
  get_recent_inbound_messages: legacyGetRecentInboundMessagesRoute,
};
