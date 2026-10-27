/**
 * Trims a chat command and drops its trailing sentence punctuation, so the
 * pulse request patterns can anchor on the whole message.
 */
export function normalizeCommand(text: string | null | undefined): string {
  return (text ?? "")
    .trim()
    .replace(/[.!?؟]+$/u, "")
    .trim();
}
