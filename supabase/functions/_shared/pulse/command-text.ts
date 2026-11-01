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

/** "כרמן," or "carmen " that may open a command. */
export const CARMEN_ADDRESS = String.raw`(?:(?:כרמן|קרמן|carmen)[,\s]+)?`;

/**
 * Polite openers ("תני לי", "אפשר", ...) that may come before a pulse request
 * in isCachedPulseRequest and isBarePulseRefreshRequest.
 */
export const POLITE_OPENERS = "תני לי|תן לי|הציגי|הצג|אפשר|מה|תראי לי|תראה לי";
