/**
 * Whether a concept is the user's choice. On Staging (5 Nov) Carmen invented a concept on the first
 * turn, passed its title as `concept` after the user tapped her own "approve the script" button,
 * and the concept gate took it, so the user never chose a concept. A concept counts only when the
 * user picked it in this turn: an option of the concept question that their message names (its tap,
 * its words or its place, "השני"), or a concept they described themselves after a concept cue
 * ("הקונספט…", "רעיון…", "בסרט ש…"). Words of the request alone are not a concept: Carmen builds her
 * own titles from them ("פסח של חיסכון" from a Pesach savings request).
 */

import type { BriefAnswers } from "./brief-answers.ts";
import { CONCEPT_LABEL } from "./film-script.ts";
import { askedChoices } from "./tapped-answers.ts";

/** What the user said and saw in this turn. */
export interface ConceptTurn {
  userText: string;
  lastAssistant: string;
}

/** Share of the concept's words the user's described concept must hold. */
const MIN_OVERLAP = 0.75;
/** The board's approve button sends "קונספט: <title>" (PageActions.tsx). */
const CONCEPT_LINE = new RegExp(
  `^\\s*${CONCEPT_LABEL}\\s*:\\s*(.+?)\\s*$`,
  "m",
);
/** Where the user starts describing a concept of their own. */
const CONCEPT_CUE = new RegExp(
  `(?:^|\\n)\\s*${CONCEPT_LABEL}\\s*:|ה${CONCEPT_LABEL}|רעיון|בסרט ש|סרט(?:ון)? שבו`,
);
/** An option named by its place among the offered ones; -1 is the last. */
const ORDINALS: Array<[RegExp, number]> = [
  [/(?:^| )(?:ה?ראשו(?:ן|נה)|1)(?= |$)/, 0],
  [/(?:^| )(?:ה?שני(?:ה|יה)?|2)(?= |$)/, 1],
  [/(?:^| )(?:ה?שלישי(?:ת)?|3)(?= |$)/, 2],
  [/(?:^| )(?:ה?רביעי(?:ת)?|4)(?= |$)/, 3],
  [/(?:^| )ה?אחרו(?:ן|נה)(?= |$)/, -1],
];
/** One-letter Hebrew prefixes a word may carry in the user's text ("ב", "ה", "ו"…). */
const PREFIXES = ["", "ו", "ה", "ב", "ל", "מ", "ש", "כ"];

/** The concept is one the user picked in this turn or described in their own words. */
export function conceptPickedByUser(concept: string, turn: ConceptTurn) {
  const wanted = plain(concept);
  if (!wanted) {
    return false;
  }
  return offeredAndAnswered(wanted, turn) || inOwnWords(wanted, turn.userText);
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

/**
 * The concept is exactly an option of the concept question in Carmen's last message, and the
 * user's message names that option: its tap, all its words, or its place ("השני", "2").
 */
function offeredAndAnswered(wanted: string, turn: ConceptTurn) {
  const said = plain(turn.userText);
  return askedChoices(turn.lastAssistant)
    .filter((choice) => choice.label.includes(CONCEPT_LABEL))
    .some((choice) => {
      const options = choice.options.map(plain);
      const index = options.indexOf(wanted);
      return (
        index >= 0 &&
        (said === wanted ||
          hasAllWords(said, wanted) ||
          ordinalIndex(said, options.length) === index)
      );
    });
}

/** The one option place the user's text names, or null when it names none or several. */
function ordinalIndex(said: string, count: number): number | null {
  const named = new Set(
    ORDINALS.filter(([pattern]) => pattern.test(said)).map(([, index]) =>
      index < 0 ? count - 1 : index,
    ),
  );
  return named.size === 1 ? [...named][0] : null;
}

/**
 * Every word of the option is a word of the user's text (a Hebrew prefix letter aside), and the
 * text does not turn it down ("לא יום אחד").
 */
function hasAllWords(said: string, option: string) {
  const padded = ` ${said} `;
  const declined = ["לא ", "לא את ", "לא ה"].some((no) =>
    padded.includes(` ${no}${option}`),
  );
  return (
    !declined &&
    option
      .split(" ")
      .every((word) =>
        PREFIXES.some((prefix) => padded.includes(` ${prefix}${word} `)),
      )
  );
}

/**
 * Most of the concept's words are in the part of the user's text that describes a concept: from a
 * concept cue on. A request without a cue describes the film, not a concept.
 */
function inOwnWords(wanted: string, text: string) {
  const raw = String(text ?? "");
  const cue = raw.search(CONCEPT_CUE);
  if (cue < 0) {
    return false;
  }
  const said = plain(raw.slice(cue));
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
