/**
 * Carmen asks a question with answers the user can tap. She writes them inside her message:
 *
 *   [[בחירה: סגנון | ריאליסטי | קולנועי | איור]]
 *
 * One group per question. The markers never show as text; the chat turns each group into a row
 * of buttons, and a tap is sent as the user's answer. Every group also offers "אחר…", a short
 * answer in the user's own words, unless Carmen already wrote an "other" option herself.
 */

export interface QuickReplyGroup {
  label: string;
  options: string[];
}

const GROUP = /\[\[\s*(?:בחירה|choice)\s*:([^\]]*)\]\]/gi;
const PARTIAL_TAIL = /\[\[[^\]]*$/;
const MAX_OPTIONS = 6;
const MAX_OPTION_CHARS = 60;
/** The server keeps an answer up to this length (MAX_ANSWER in workshop/brief-answers.ts). */
export const MAX_FREE_ANSWER_CHARS = 200;
export const OTHER_OPTION = "אחר…";
const OTHER = /^\s*(?:אחר|אחרת|other)(?:[\s.…:()-]|$)/i;

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

/** Whether the group gets an "אחר…" button: not when one of Carmen's options already is one. */
export const offersOther = (group: QuickReplyGroup) =>
  !group.options.some((option) => OTHER.test(option));

/**
 * The user's own answer, ready to stand in for a tap: one line, so it cannot break the
 * "label: answer" lines several groups send, and no longer than the server keeps.
 */
export const freeAnswer = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, MAX_FREE_ANSWER_CHARS).trim();

/**
 * What one tap, or a set of taps, says on the user's behalf. A lone tap goes as the option
 * itself; an answer in the user's own words always names its question ("קצב: …"), because the
 * server only saves a bare answer to the brief when it is one of the options.
 */
export function quickReplyAnswer(
  groups: QuickReplyGroup[],
  picked: Record<string, string>,
): string {
  if (groups.length === 1) {
    const [group] = groups;
    const answer = picked[group.label] ?? "";
    return !answer || group.options.includes(answer)
      ? answer
      : `${group.label}: ${answer}`;
  }
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
