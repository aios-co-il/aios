import type { ToolExecutionContext } from "../tool-context.ts";
import { createChatReadContext } from "./chat-context.ts";
import { getRecentInboundMessages } from "../chat-scope/readers.ts";

export function legacyGetRecentInboundMessagesRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const chatRead = createChatReadContext(context);

  return getRecentInboundMessages(chatRead, args);
}
