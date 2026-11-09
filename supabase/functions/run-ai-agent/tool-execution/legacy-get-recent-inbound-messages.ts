import type { ToolExecutionContext } from "../tool-context.ts";

import { createChatReadContext } from "./chat-context.ts";
import { getRecentInboundMessages } from "../chat-scope/readers.ts";

/** Preserves legacy routing for get_recent_inbound_messages. */
export function legacyGetRecentInboundMessagesRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const chatRead = createChatReadContext(context);

  return getRecentInboundMessages(chatRead, args);
}
