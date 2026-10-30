/**
 * True when this turn already shows `content` as an assistant reply: a stored
 * reply can arrive over realtime and in the HTTP response. Only replies after
 * the last user message count, so a later turn may repeat an earlier answer.
 */
export function replyShownThisTurn(
  messages: ReadonlyArray<{ role: string; content?: string | null }>,
  content: string,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return false;
    if (m.role === "assistant" && m.content === content) return true;
  }
  return false;
}
