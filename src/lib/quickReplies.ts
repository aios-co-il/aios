/**
 * Carmen asks a question with answers the user can tap. She writes them inside her message:
 *
 *   [[בחירה: סגנון | ריאליסטי | קולנועי | איור]]
 *
 * One group per question. The markers never show as text; the chat turns each group into a row
 * of buttons, and a tap is sent as the user's answer.
 */

export interface QuickReplyGroup {
  label: string;
  options: string[];
}

const GROUP = /\[\[\s*(?:בחירה|choice)\s*:([^\]]*)\]\]/gi;
const PARTIAL_TAIL = /\[\[[^\]]*$/;
const MAX_OPTIONS = 6;
const MAX_OPTION_CHARS = 60;

export function parseQuickReplies(content: string): {
  text: string;
  groups: QuickReplyGroup[];
} {
  const groups: QuickReplyGroup[] = [];
  const text = content
    .replace(GROUP, (_match, body: string) => {
      const [label, ...rest] = body.split("|").map((part) => part.trim());
      const options = [...new Set(rest.filter(Boolean))]
        .map((option) => option.slice(0, MAX_OPTION_CHARS))
        .slice(0, MAX_OPTIONS);
      if (label && options.length > 0) groups.push({ label, options });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, groups };
}

/** While a reply is still arriving, a half-written marker must not flash on screen. */
export const hidePartialQuickReplies = (content: string) =>
  parseQuickReplies(content).text.replace(PARTIAL_TAIL, "").trimEnd();

/** What one tap, or a set of taps, says on the user's behalf. */
export function quickReplyAnswer(
  groups: QuickReplyGroup[],
  picked: Record<string, string>,
): string {
  if (groups.length === 1) return picked[groups[0].label] ?? "";
  return groups
    .filter((group) => picked[group.label])
    .map((group) => `${group.label}: ${picked[group.label]}`)
    .join("\n");
}

/**
 * Which message may still be answered by tapping: the latest assistant reply, as long as the user
 * has not written anything since. Tool rows after it do not close the question.
 */
export function answerableIndex(messages: { role: string }[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const role = messages[index].role;
    if (role === "user") return -1;
    if (role === "assistant") return index;
  }
  return -1;
}
