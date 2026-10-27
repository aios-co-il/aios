/** The numbers model wording may repeat for a campaign_exception (AIO-243). */
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";

// A number, or a date/time/range compared whole, so "2026-10-20T08:00" in the
// evidence does not make "20" or "8" look like known numbers.
const NUMBER_TOKEN = /\d+(?:(?:[.,:/-]|T)\d+)*/g;
// A number followed by "ימים"/"הימים" names a window length ("3 ימים",
// "ב־7 הימים"). It becomes its own token, so a window label never licenses
// the same digit as a value ("פי 3", "ירידה של 7%").
const DAY_UNIT_AFTER = /\s*ה?(?:ימים|יום)(?![\p{L}\p{N}])/uy;
const DAYS_SUFFIX = " ימים";
// Numbers, fractions and multipliers written as Hebrew words, in both
// spellings ("שלושה"/"שלשה"), which code cannot check against the evidence.
// Each takes up to two one-letter prefixes ("ובשלושה", "לחצי", "השניים").
// Masculine ordinals are left out: they also name weekdays ("יום שלישי").
const NUMBER_WORDS = [
  "אפס שניים שתיים שתים שלוש שלש שלושה שלשה ארבע ארבעה חמש חמישה חמשה",
  "שש שישה ששה שבע שבעה שמונה תשע תשעה עשר עשרה",
  "עשרים שלושים שלשים ארבעים חמישים חמשים שישים ששים שבעים שמונים תשעים",
  "עשרות תריסר מאה מאות מאתיים מאתים אלף אלפים אלפיים",
  "מיליון מליון מיליונים מליונים מיליארד מליארד מיליארדים מליארדים",
  "יומיים שבועיים חודשיים שנתיים פעמיים",
  "חצי מחצית שליש רבע שלישית רביעית חמישית שישית שביעית שמינית תשיעית עשירית",
  "משולש משולשת שולש שולשה שילש",
];
const NUMBER_WORD = wordPattern("ובהלמשכ", NUMBER_WORDS.join(" ").split(" "));
// Construct forms ("שלושת הימים", "שני קמפיינים") never take ה, so
// "העשרת קהלים" (enrichment) and "הצד השני" (the other) are not numbers.
// "שני" right after "יום" names Monday.
const CONSTRUCT_NUMBER_WORD = wordPattern("ובלמשכ", [
  "שני(?<!יום[\\s\\-־]שני)",
  ..."שתי שלושת שלשת ארבעת חמשת ששת שבעת שמונת תשעת עשרת אלפי".split(" "),
]);
// "אחד"/"אחת" as a count ("ליד אחד בלבד"), not "one of" ("אחד הקמפיינים",
// "אחת מהמודעות") and not prefixed ("לאחד" is to merge).
const ONE_AS_COUNT =
  /(?<![\p{L}\p{N}])(?:אחד|אחת)(?![\p{L}\p{N}])(?!\s+(?:ה|מה|מבין|מתוך|מכל))/u;
// The כפל (double) root in any form and with any prefix: "כפל", "כפולה",
// "הכפלת", "מוכפלת", "כופל", "התכפלו". Duplication words from the same
// letters ("כפילות", "שכפול") are dropped with it.
const DOUBLE_ROOT = /כ[וי]?פ[וי]?ל/u;
// "פי" (times) as its own word, also right before a digit ("פי3"); "לפי"
// and "על פי" mean "according to". A multiplication sign or an "x" next to
// a digit ("x2", "3×") is a multiplier too.
const TIMES_WORD = /(?<![\p{L}\p{N}])(?<!על[\s\-־])פי(?!\p{L})/u;
const TIMES_SIGN = /×|(?<![a-z])x\s?\d|\d\s?x(?![a-z])/iu;
const ENGLISH_NUMBER_WORD = new RegExp(
  `\\b(?:${[
    "zero two three four five six seven eight nine ten eleven twelve",
    "twenty thirty forty fifty sixty seventy eighty ninety",
    "hundreds? thousands? millions? billions? dozens?",
    "double[ds]? doubling twice thrice triple[ds]? tripling quadruple[ds]?",
    "half halve[ds]? halving",
  ]
    .join(" ")
    .split(" ")
    .join("|")})\\b`,
  "i",
);

/**
 * Numbers the model may repeat: the values code computed for this alert
 * (evidence: target, efficiency, dates) and the window lengths the message
 * names ("3 ימים", "ב־7 הימים"). Other digits in the message, such as a
 * window label or a client or campaign name, license nothing.
 */
export function deterministicNumbers(
  candidate: PulseInstantAlertCandidate,
): Set<string> {
  const tokens = numberTokens(candidate.message).filter((token) =>
    token.endsWith(DAYS_SUFFIX),
  );
  evidenceValueTokens(candidate.evidence || {}, tokens);
  return new Set(tokens);
}

/** Number tokens in text, a window length tagged " ימים". */
export function numberTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = normalizeNumberToken(match[0]);
    DAY_UNIT_AFTER.lastIndex = (match.index ?? 0) + match[0].length;
    tokens.push(DAY_UNIT_AFTER.test(text) ? `${token}${DAYS_SUFFIX}` : token);
  }
  return tokens;
}

/** True when text writes a number, fraction or multiplier as a word. */
export function hasNumberWord(text: string): boolean {
  return [
    NUMBER_WORD,
    CONSTRUCT_NUMBER_WORD,
    ONE_AS_COUNT,
    DOUBLE_ROOT,
    TIMES_WORD,
    TIMES_SIGN,
    ENGLISH_NUMBER_WORD,
  ].some((pattern) => pattern.test(text));
}

/** Canonical form of a number token: 1,200 → 1200, 52.0 → 52, 3,5 → 3.5. */
function normalizeNumberToken(token: string): string {
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token)) {
    return String(Number(token.replaceAll(",", "")));
  }

  if (/^\d+(?:[.,]\d+)?$/.test(token)) {
    return String(Number(token.replace(",", ".")));
  }

  return token;
}

/** Adds the number tokens of an evidence value, nested values included. */
function evidenceValueTokens(value: unknown, out: string[]): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(...numberTokens(String(value)));
  } else if (typeof value === "string") {
    out.push(...numberTokens(value));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      evidenceValueTokens(item, out);
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      // Trends are percentages, which model text may not state (see PERCENT
      // and SIGNED_NUMBER in wording-line.ts); as a bare number they would
      // only fit a wrong role.
      if (!key.endsWith("_pct")) {
        evidenceValueTokens(item, out);
      }
    }
  }
}

/**
 * A whole word from `words`, after up to two one-letter `prefixes`. Each
 * word is a regex source, so it may carry its own lookbehind.
 */
function wordPattern(prefixes: string, words: string[]): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])[${prefixes}]{0,2}(?:${words.join("|")})(?![\\p{L}\\p{N}])`,
    "u",
  );
}
