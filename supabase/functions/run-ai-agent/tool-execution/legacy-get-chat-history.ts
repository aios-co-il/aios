import type { ToolExecutionContext } from "../tool-context.ts";
import { createChatReadContext } from "./chat-context.ts";
import { getChatHistory } from "../chat-scope/readers.ts";

export function legacyGetChatHistoryRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const chatRead = createChatReadContext(context);

  return getChatHistory(chatRead, args);
}
