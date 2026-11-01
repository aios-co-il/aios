/**
 * Pure helpers for saving Carmen's streamed chat answer on the server
 * (see background-reply.ts): what the turn produced, and the reply key.
 */

/** Collects what a streamed turn produced, from the events it emits. */
export function createReplyRecorder() {
  let conversationId: string | null = null;
  let text = "";
  return {
    /** Feed every emitted SSE event through this. */
    observe(event: { type?: string; id?: unknown; content?: unknown }) {
      if (event?.type === "conversation_id" && typeof event.id === "string")
        conversationId = event.id;
      if (event?.type === "token" && typeof event.content === "string")
        text += event.content;
    },
    get conversationId() {
      return conversationId;
    },
    /** The streamed text, or the final output when nothing was streamed. */
    reply(finalOutput: unknown): string {
      if (text.trim()) return text;
      return typeof finalOutput === "string" ? finalOutput : "";
    },
  };
}

/** A safe idempotency key from the request, or null. */
export function parseReplyKey(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value)
    ? value
    : null;
}
