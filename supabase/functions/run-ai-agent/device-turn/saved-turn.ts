/**
 * The messages a run-ai-agent turn saves to `ai_conversations` (AIO-686). A device
 * continuation has no message of the user's: its answer joins the paused turn's answer, so
 * the saved history keeps alternating user and assistant for every provider.
 */
import type { ChatTurn } from "../fast-lane/answer.ts";

/** How many messages a conversation keeps. */
const SAVED_MESSAGES = 60;

/** The history with this turn added; `message` is null on a device continuation. */
export function savedTurnMessages(
  history: ReadonlyArray<ChatTurn>,
  message: string | null,
  answer: string,
): Array<ChatTurn> {
  const last = history.at(-1);
  const turn: Array<ChatTurn> =
    message === null && last?.role === "assistant"
      ? [
          ...history.slice(0, -1),
          { role: "assistant", content: `${last.content}\n\n${answer}` },
        ]
      : [
          ...history,
          ...(message === null
            ? []
            : [{ role: "user" as const, content: message }]),
          { role: "assistant", content: answer },
        ];
  return turn.slice(-SAVED_MESSAGES);
}
