/** Max length of a chat topic name, matching the chat list. */
export const TOPIC_MAX = 48;

/**
 * Tidies a model's topic reply into a short title, or null when it is empty
 * or looks like a sentence rather than a name.
 */
export function cleanTopic(raw: string | null | undefined): string | null {
  const text = String(raw ?? "")
    .split("\n")[0]
    .replace(/^["'“”׳״\s]+|["'“”׳״.!?:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.split(" ").length > 8) return null;
  return text.slice(0, TOPIC_MAX);
}
