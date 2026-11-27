import type { ToolExecutionContext } from "../tool-context.ts";
import { createChatReadContext } from "./chat-context.ts";
import { executeSearchConversationHistory } from "../executors/search-conversation-history.ts";

export function legacySearchConversationHistoryRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const chatRead = createChatReadContext(context);

  return executeSearchConversationHistory(
    args as Parameters<typeof executeSearchConversationHistory>[0],
    context,
    chatRead,
  );
}
