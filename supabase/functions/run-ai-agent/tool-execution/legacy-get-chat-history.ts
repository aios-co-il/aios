import type { ToolExecutionContext } from "../tool-context.ts";

import { createChatReadContext } from "./chat-context.ts";
import { getChatHistory } from "../chat-scope/readers.ts";

/** Preserves legacy routing for get_chat_history. */
export function legacyGetChatHistoryRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const chatRead = createChatReadContext(context);

  return getChatHistory(chatRead, args);
}
