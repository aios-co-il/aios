/**
 * Whether a concept is the user's choice. On Staging (5 Nov) Carmen invented a concept on the first
 * turn, passed its title as `concept` after the user tapped her own "approve the script" button,
 * and the concept gate took it, so the user never chose a concept. A concept counts only when the
 * user picked it: a tap or a word answer to the concept question, or their own words in this
 * message (on the first turn, the request itself).
 */

import type { BriefAnswers } from "./brief-answers.ts";
import { CONCEPT_LABEL } from "./film-script.ts";
import { askedChoices } from "./tapped-answers.ts";

/** What the user said and saw in this turn. */
export interface ConceptTurn {
  userText: string;
  lastAssistant: string;
}

/**
 * Share of the concept's words the user's own text must hold to count as their concept: high, so a
 * title Carmen made up from one or two words of the request ("פסח של חיסכון") does not pass.
 */
const MIN_OVERLAP = 0.75;
/** The board's approve button sends "קונספט: <title>" (PageActions.tsx). */
const CONCEPT_LINE = new RegExp(
  `^\\s*${CONCEPT_LABEL}\\s*:\\s*(.+?)\\s*$`,
  "m",
);

/** The concept is one the user picked in this turn or described in their own words. */
export function conceptPickedByUser(concept: string, turn: ConceptTurn) {
  const wanted = plain(concept);
  if (!wanted) {
    return false;
  }
  return (
    offeredAndAnswered(wanted, turn.lastAssistant) ||
    inOwnWords(wanted, turn.userText)
  );
}

/** The answers without a concept answer the user did not pick (Carmen's brief_answers). */
export function withoutUnpickedConcept(
  answers: BriefAnswers,
  turn: ConceptTurn,
): BriefAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(
      ([label, answer]) =>
        !label.includes(CONCEPT_LABEL) || conceptPickedByUser(answer, turn),
    ),
  );
}

/** The concept the user approved in their own message: a "קונספט: <name>" line. */
export function conceptFromMessage(userText: string): string {
  return (
    String(userText ?? "")
      .match(CONCEPT_LINE)?.[1]
      ?.slice(0, 200) ?? ""
  );
}

/** Carmen's last message asked the concept question and the concept is one of its options. */
function offeredAndAnswered(wanted: string, lastAssistant: string) {
  return askedChoices(lastAssistant)
    .filter((choice) => choice.label.includes(CONCEPT_LABEL))
    .some((choice) =>
      choice.options.some((option) => {
        const offered = plain(option);
        return offered === wanted || wanted.includes(offered);
      }),
    );
}

/** Most of the concept's words are in the user's own text (a Hebrew prefix letter aside). */
function inOwnWords(wanted: string, text: string) {
  const said = plain(text);
  const words = wanted.split(" ").filter((word) => word.length >= 3);
  if (words.length === 0) {
    return false;
  }
  const found = words.filter(
    (word) =>
      said.includes(word) || (word.length > 3 && said.includes(word.slice(1))),
  );
  return found.length / words.length >= MIN_OVERLAP;
}

/** Text compared without punctuation, quotes or case. */
const plain = (text: string) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[|[\]"'״׳.,!?:;()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
