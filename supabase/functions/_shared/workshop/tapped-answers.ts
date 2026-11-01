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

export function tappedAnswers(
  lastAssistant: string,
  userText: string,
): BriefAnswers {
  // The budget question is answered by its code (budget-approve.ts), not kept in the brief.
  const asked = askedChoices(lastAssistant).filter(
    (choice) => !/תקציב/.test(choice.label),
  );
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
