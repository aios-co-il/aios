/**
 * Answers the user tapped to the questions in Carmen's last message, including questions she
 * wrote herself ("אווירה"). A single question's tap sends only the option, so the question is
 * read back from her message. The markers match src/lib/quickReplies.ts.
 */

import type { BriefAnswers } from "./brief-answers.ts";
import type { Choice } from "./briefing-choices.ts";

const GROUP = /\[\[\s*(?:בחירה|choice)\s*:([^\]]*)\]\]/gi;
const MAX_ANSWER = 200;

/** The tap-to-answer questions in a message. */
export function askedChoices(message: string): Choice[] {
  const asked: Choice[] = [];
  for (const match of String(message ?? "").matchAll(GROUP)) {
    const [label, ...options] = match[1].split("|").map((part) => part.trim());
    if (label && options.some(Boolean))
      asked.push({ label, options: options.filter(Boolean) });
  }
  return asked;
}

/** A script question's label (script-approval.ts reads its answer; the brief does not keep it). */
export const isScriptLabel = (label: string) => label.includes("תסריט");

/**
 * The answers to Carmen's questions in her last message, for the brief. The budget question is
 * answered by its code (budget-approve.ts) and the script question by script-approval.ts; neither
 * is kept in the brief.
 */
export function tappedAnswers(
  lastAssistant: string,
  userText: string,
): BriefAnswers {
  const asked = askedChoices(lastAssistant).filter(
    (choice) => !/תקציב/.test(choice.label) && !isScriptLabel(choice.label),
  );
  return answersTo(asked, userText);
}

/** The user's answers to these questions: "נושא: תשובה" lines, or a lone tap one question owns. */
export function answersTo(
  asked: Array<Choice>,
  userText: string,
): BriefAnswers {
  if (asked.length === 0) return {};
  const labels = new Set(asked.map((choice) => choice.label));
  const answers: BriefAnswers = {};
  for (const line of String(userText ?? "").split("\n")) {
    const match = line.match(/^\s*([^:]{1,40}):\s*(.+?)\s*$/);
    if (match && labels.has(match[1].trim()))
      answers[match[1].trim()] = match[2].slice(0, MAX_ANSWER);
  }
  if (Object.keys(answers).length > 0) return answers;
  const lone = String(userText ?? "").trim();
  const owners = asked.filter((choice) => choice.options.includes(lone));
  return owners.length === 1 ? { [owners[0].label]: lone } : {};
}

/** Carmen's last message in the history the chat sent (its questions are answered now). */
export function lastAssistantText(history: unknown): string {
  if (!Array.isArray(history)) return "";
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index] as { role?: unknown; content?: unknown };
    if (entry?.role === "assistant")
      return typeof entry.content === "string" ? entry.content : "";
  }
  return "";
}
