import { readStreamedCompletion } from "../stream-completion.ts";
import { FULL_BRAIN_TOOL } from "./instructions.ts";

/** The fast model's OpenAI-compatible endpoint. */
export type FastTarget = { url: string; key: string; model: string };

/** One earlier chat message. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * The fast model either answered (its text already reached the chat) or handed the turn over;
 * `shown` says whether some of its text reached the chat before that.
 */
export type FastAnswer =
  | {
      kind: "answered";
      text: string;
      usage: { prompt_tokens?: number; completion_tokens?: number } | null;
    }
  | { kind: "escalate"; reason: string; shown: boolean };

export type FastAnswerRequest = {
  target: FastTarget;
  instructions: string;
  history: Array<ChatTurn>;
  message: string;
  onText: (delta: string) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

// Enough history to follow the thread; the full brain gets the whole conversation.
const HISTORY_TURNS = 12;
// Text is held back until this many characters arrived, so a model that writes a few words
// and then hands over does not leave them in the chat.
const HOLD_CHARS = 24;
const TIMEOUT_MS = 15_000;

const FULL_BRAIN = {
  type: "function",
  function: {
    name: FULL_BRAIN_TOOL,
    description:
      "מעביר את ההודעה למוח המלא של כרמן: זיכרון, נתוני המערכת וכל הכלים.",
    parameters: { type: "object", properties: {} },
  },
};

/**
 * Asks the fast model and streams its answer to the chat. Any failure, and any call to the
 * full-brain tool, returns `escalate`, so the turn falls through to the full brain unchanged.
 */
export async function answerFast(
  request: FastAnswerRequest,
): Promise<FastAnswer> {
  const { target, onText } = request;
  let held = "";
  let flowing = false;
  const escalate = (reason: string): FastAnswer => ({
    kind: "escalate",
    reason,
    shown: flowing,
  });
  const show = (delta: string) => {
    if (flowing) {
      return onText(delta);
    }
    held += delta;
    if (held.length >= HOLD_CHARS) {
      flowing = true;
      onText(held);
    }
  };
  try {
    const res = await (request.fetchImpl ?? fetch)(target.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(request)),
      signal: AbortSignal.timeout(request.timeoutMs ?? TIMEOUT_MS),
    });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      return escalate(`http_${res.status}`);
    }
    const { message, usage } = await readStreamedCompletion(res.body, show);
    if (message.tool_calls?.length) {
      return escalate("handed_over");
    }
    const text = message.content.trim();
    if (!text) {
      return escalate("empty");
    }
    if (!flowing) {
      onText(held);
    }
    return { kind: "answered", text, usage };
  } catch (e) {
    return escalate(e instanceof Error ? e.name : "error");
  }
}

/** User and assistant messages from a request's history; anything else is dropped. */
export function chatTurns(raw: unknown): Array<ChatTurn> {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((m) =>
    m &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string"
      ? [{ role: m.role, content: m.content }]
      : [],
  );
}

/** The streamed Chat Completions request: instructions, recent history, the message, one tool. */
function requestBody({
  target,
  instructions,
  history,
  message,
}: FastAnswerRequest) {
  return {
    model: target.model,
    messages: [
      { role: "system", content: instructions },
      ...history.slice(-HISTORY_TURNS),
      { role: "user", content: message },
    ],
    tools: [FULL_BRAIN],
    stream: true,
    stream_options: { include_usage: true },
  };
}
