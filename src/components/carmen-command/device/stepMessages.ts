/**
 * One assistant message for a whole chain of browser steps (AIO-656): each continuation has
 * its own reply_key, under which the server saves that part, and its text joins the paused
 * answer in the chat, as the server joins it in `ai_conversations`
 * (`run-ai-agent/device-turn/saved-turn.ts`).
 */

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
 * was reloaded meanwhile), the text becomes its own message, so no answer is lost.
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
  const joined = messages[index].content
    ? `${messages[index].content}\n\n${text}`
    : text;

  return messages.map((message, at) =>
    at === index ? { ...message, content: joined } : message,
  );
}
