/**
 * One assistant message for a whole chain of browser steps (AIO-656): each continuation has
 * its own reply_key, under which the server saves that part, and its text joins the paused
 * answer in the chat, as the server joins it in `ai_conversations`
 * (`run-ai-agent/device-turn/saved-turn.ts`).
 */
import type { PanelClaimFailure } from "@functions/_shared/carmen/device/panel-envelope.ts";
import { isClaimFailure } from "./panelStep";
import type { StepChainEnd } from "./stepChain";

/** The fields of a chat message these helpers read and write. */
export type KeyedMessage = {
  content?: string;
  /** The turn's reply_key. */
  replyKey?: string;
  /** The reply_keys of the continuations whose text this message holds. */
  stepReplyKeys?: ReadonlyArray<string>;
};

/** What the chat says when the server asks for more steps than one message may lead to. */
export const STEP_LIMIT_TEXT =
  "הגעתי למספר הפעולות בדפדפן שמותר להודעה אחת. אפשר לכתוב לי שוב כדי להמשיך.";

/** What the chat says when the panel said nothing within the wait; the run then continues. */
export const STEP_TIMEOUT_TEXT =
  "התוסף של AIOS בכרום לא ענה בזמן, ולכן הפעולה בדפדפן לא בוצעה. כדאי לוודא שהחלונית של התוסף פתוחה ושהתוסף מחובר לאותו משתמש כמו באתר, ואז לבקש שוב.";

/** What the chat says when the panel could not claim the step, by why. */
export const CLAIM_FAILURE_TEXT: Record<PanelClaimFailure, string> = {
  signed_out:
    "התוסף של AIOS בכרום לא מחובר, ולכן לא יכולתי לפעול בדפדפן. צריך להתחבר בחלון התוסף (הסמל של AIOS בסרגל הכלים), לסגור ולפתוח את החלונית מחדש ולבקש שוב.",
  refused:
    "התוסף של AIOS בכרום לא הצליח לקחת את הפעולה בדפדפן. כנראה שהוא מחובר למשתמש אחר מזה שבאתר: כדאי לבדוק בחלון התוסף שזה אותו משתמש, להתחבר מחדש אם צריך ולבקש שוב.",
  failed:
    "התוסף של AIOS בכרום לא הצליח לקחת את הפעולה בדפדפן בגלל תקלה. אפשר לבקש שוב בעוד רגע.",
};

/** The line a chain's end adds to the answer, or null when the answer says it all. */
export function stepEndText(end: StepChainEnd | null): string | null {
  if (end === "limit") {
    return STEP_LIMIT_TEXT;
  }
  return end && isClaimFailure(end) ? CLAIM_FAILURE_TEXT[end] : null;
}

/** Whether a message already holds the answer saved under this key. */
export function holdsReplyKey(message: KeyedMessage, key: string): boolean {
  return (
    message.replyKey === key || Boolean(message.stepReplyKeys?.includes(key))
  );
}

/**
 * Marks the paused answer as holding a continuation's key before the continuation is sent,
 * so the server's saved copy of that part, arriving over realtime, is not shown twice.
 */
export function withStepReplyKey<M extends KeyedMessage>(
  messages: Array<M>,
  intoReplyKey: string,
  stepReplyKey: string,
): Array<M> {
  return messages.map((message) =>
    message.replyKey === intoReplyKey && !holdsReplyKey(message, stepReplyKey)
      ? {
          ...message,
          stepReplyKeys: [...(message.stepReplyKeys ?? []), stepReplyKey],
        }
      : message,
  );
}

/**
 * Adds a continuation's text to the message holding its key. When no message does (the chat
 * was reloaded meanwhile), the text becomes its own message, so no answer is lost; when the
 * server's saved copy already is that message, nothing changes.
 */
export function joinStepAnswer<M extends KeyedMessage>(
  messages: Array<M>,
  stepReplyKey: string,
  text: string,
  ownMessage: M,
): Array<M> {
  const index = messages.findIndex((message) =>
    holdsReplyKey(message, stepReplyKey),
  );
  if (index < 0) {
    return [...messages, ownMessage];
  }
  // The server's saved copy of this part arrived first, as its own message: it already holds it.
  if (messages[index].replyKey === stepReplyKey) {
    return messages;
  }
  return appendAt(messages, index, text);
}

/**
 * Adds a line of the chat's own (the step limit, a panel that could not take the step or did
 * not answer) to the paused answer, whose own reply_key `pausedReplyKey` is; when the chat no
 * longer holds that answer, the line becomes its own message. The server never saves these
 * lines, so no saved copy can already hold them.
 */
export function joinStepLine<M extends KeyedMessage>(
  messages: Array<M>,
  pausedReplyKey: string,
  line: string,
  ownMessage: M,
): Array<M> {
  const index = messages.findIndex((message) =>
    holdsReplyKey(message, pausedReplyKey),
  );
  return index < 0
    ? [...messages, ownMessage]
    : appendAt(messages, index, line);
}

/** The messages with `text` added as a new paragraph of the one at `index`. */
function appendAt<M extends KeyedMessage>(
  messages: Array<M>,
  index: number,
  text: string,
): Array<M> {
  const joined = messages[index].content
    ? `${messages[index].content}\n\n${text}`
    : text;

  return messages.map((message, at) =>
    at === index ? { ...message, content: joined } : message,
  );
}
