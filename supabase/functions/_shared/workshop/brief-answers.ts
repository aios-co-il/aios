/**
 * The user's answers to Carmen's briefing questions, kept on the project (payload.workshop_brief)
 * so she can come back to them later and never asks the same thing twice. Answers arrive as the
 * tap-to-answer lines ("קצב: רגוע ורגשי") or as brief_answers from Carmen.
 */

import {
  FILM_CHOICES,
  STYLE_CHOICES,
  type Choice,
} from "./briefing-choices.ts";

const KEY = "workshop_brief";
const MAX_ANSWER = 200;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const ALL_CHOICES: Choice[] = [
  ...STYLE_CHOICES.video,
  ...STYLE_CHOICES.static,
  ...FILM_CHOICES,
];
/**
 * Names Carmen or the user give the same question. Carmen writes her own buttons ("סגנון חזותי",
 * "סגיר"), so a standard question counts as answered under any of its names and is asked once.
 */
const TOPICS: Record<string, string[]> = {
  סיום: ["סיום", "סגיר", "סגירה", "קריאה לפעולה", "cta"],
  קול: ["קול", "קריינות", "קול קריינות", "קריין", "קריינית"],
  מראה: ["מראה", "סגנון", "סגנון חזותי", "סגנון ויזואלי", "לוק"],
  מוזיקה: ["מוזיקה", "מוסיקה", "מוזיקת רקע"],
  דמות: ["דמות", "דמויות"],
  צבעים: ["צבעים", "צבע", "פלטת צבעים"],
  קצב: ["קצב", "טמפו"],
};
const normal = (label: string) =>
  label
    .toLowerCase()
    .replace(/["'״׳:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const TOPIC_OF = new Map(
  Object.entries(TOPICS).flatMap(([topic, names]) =>
    names.map((name) => [normal(name), topic] as const),
  ),
);

/** The question a label names: its standard topic, or the label itself. */
export const topicOf = (label: string) =>
  TOPIC_OF.get(normal(label)) ?? normal(label);

const LABELS = new Set(ALL_CHOICES.map((choice) => choice.label));
const known = (label: string) =>
  LABELS.has(label) || TOPIC_OF.has(normal(label));

export type BriefAnswers = Record<string, string>;

/** The answer to a question under any of its names (סיום, סגיר, קריאה לפעולה…). */
export function answerFor(answers: BriefAnswers, label: string): string {
  if (answers[label]) return answers[label];
  const topic = topicOf(label);
  const match = Object.entries(answers).find(
    ([asked, answer]) => answer && topicOf(asked) === topic,
  );
  return match?.[1] ?? "";
}

export function briefAnswersOf(payload: Record<string, unknown>): BriefAnswers {
  const stored = asRecord(asRecord(payload[KEY]).answers);
  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Reads answers from the user's message: "נושא: תשובה" lines for known questions, or a lone tap
 * that matches exactly one option of the questions still open.
 */
export function answersFromMessage(text: string, open: Choice[]): BriefAnswers {
  const answers: BriefAnswers = {};
  for (const line of String(text ?? "").split("\n")) {
    const match = line.match(/^\s*([^:]{1,40}):\s*(.+?)\s*$/);
    if (match && known(match[1].trim()))
      answers[match[1].trim()] = match[2].slice(0, MAX_ANSWER);
  }
  if (Object.keys(answers).length > 0) return answers;
  const lone = String(text ?? "").trim();
  const owners = open.filter((choice) => choice.options.includes(lone));
  return owners.length === 1 ? { [owners[0].label]: lone } : {};
}

/** Accepts brief_answers from a tool call: a label → answer object. */
export function answersFromArgs(value: unknown): BriefAnswers {
  return Object.fromEntries(
    Object.entries(asRecord(value))
      .filter(([label, answer]) => label.trim() && typeof answer === "string")
      .map(([label, answer]) => [
        label.trim().slice(0, 40),
        String(answer).trim().slice(0, MAX_ANSWER),
      ])
      .filter(([, answer]) => answer),
  );
}

export function withBriefAnswers(
  payload: Record<string, unknown>,
  answers: BriefAnswers,
): Record<string, unknown> {
  if (Object.keys(answers).length === 0) return payload;
  return {
    ...payload,
    [KEY]: {
      ...asRecord(payload[KEY]),
      answers: { ...briefAnswersOf(payload), ...answers },
    },
  };
}

/** The film brief written from the film answers, once every film question is answered. */
export function filmFromAnswers(answers: BriefAnswers): string | null {
  const lines = FILM_CHOICES.map((choice) => {
    const answer = answerFor(answers, choice.label);
    return answer ? `${choice.label}: ${answer}` : null;
  });
  return lines.every(Boolean) ? lines.join(". ") : null;
}

/**
 * A style bible written from the style answers, once every style question is answered, so a
 * fully answered brief needs no further question. Carmen's own bible, when she writes one, wins.
 */
export function styleFromAnswers(
  answers: BriefAnswers,
  kind: "video" | "static",
): string | null {
  const lines = STYLE_CHOICES[kind].map((choice) => {
    const answer = answerFor(answers, choice.label);
    return answer ? `${choice.label}: ${answer}` : null;
  });
  return lines.every(Boolean) ? lines.join(". ") : null;
}

/** Questions not yet answered under any of their names. */
export const unanswered = (choices: Choice[], answers: BriefAnswers) =>
  choices.filter((choice) => !answerFor(answers, choice.label));

/** The briefing questions were shown to the user once (briefing.ts counts Carmen's brief after that). */
export const briefAsked = (payload: Record<string, unknown>) =>
  asRecord(payload[KEY]).asked === true;

export const withBriefAsked = (payload: Record<string, unknown>) => ({
  ...payload,
  [KEY]: { ...asRecord(payload[KEY]), asked: true },
});
