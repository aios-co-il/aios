/**
 * Single words of the motion captions (motion-captions.mjs): how a spoken word is shown, whether
 * it reads left to right, and how strongly it asks to be its phrase's key word.
 */

const HEBREW = /[֐-׿]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const NIQQUD = /[֑-ׇ]/g;

/**
 * A word that reads left to right inside a Hebrew line: Latin letters or digits and no Hebrew
 * ("SEO", "24/7", "100%"). A word with Hebrew in it ("ה-AI") stays a right-to-left word; the
 * browser orders its parts. Consecutive LTR words are drawn as one LTR run, so "Carmen
 * Marketing OS" keeps its order inside the right-to-left line.
 */
export const isLtrWord = (text) =>
  LATIN_OR_DIGIT.test(text) && !HEBREW.test(text);

/**
 * The caption form of a spoken word: no sentence punctuation at its end and no quotes or
 * brackets around it; "?" and "!" stay, and so does punctuation inside ("ה-AI", "24/7").
 * A word with no letter or digit left (a dash) is not shown.
 */
export function displayWord(text) {
  const shown = String(text ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^["'“”„«»(\[{׳״]+/u, "")
    .replace(/["'“”„«»)\]}]+$/u, "")
    .replace(/[.,;:…،]+$/u, "")
    .replace(/["'“”„«»)\]}״]+$/u, "");
  return LETTER_OR_DIGIT.test(shown) ? shown : "";
}

/** A word for comparing: no niqqud, punctuation or case. */
export const plain = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .replace(NIQQUD, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** The word without one Hebrew prefix letter (ו, ה, ב, ל, מ, ש, כ). */
const unprefixed = (word) =>
  word.length > 3 && /^[והבלמשכ]/.test(word) ? word.slice(1) : word;

/** Two words are the same word, also with one prefix letter on either ("ובגוגל", "גוגל"). */
const sameWord = (a, b) =>
  a.length > 2 &&
  b.length > 2 &&
  (a === b || unprefixed(a) === b || a === unprefixed(b));

const NUMBER_WORDS = new Set(
  (
    "אחד אחת שניים שתיים שני שתי שלוש שלושה ארבע ארבעה חמש חמישה שש שישה שבע שבעה " +
    "שמונה תשע תשעה עשר עשרה עשרים שלושים ארבעים חמישים מאה מאות אלף אלפים מיליון " +
    "מיליונים מיליארד אפס"
  ).split(" "),
);

const EMPHATIC = new Set(
  (
    "הכל הכול כל רק לא אף חינם בחינם עכשיו היום מיד תמיד ראשון ראשונה ראשונים " +
    "הראשונים באמת הכי ביותר יותר חדש חדשה ענק מושלם"
  ).split(" "),
);

const isNumber = (word, shown) =>
  /\p{N}/u.test(shown) ||
  NUMBER_WORDS.has(word) ||
  NUMBER_WORDS.has(unprefixed(word));

/**
 * How strongly a word asks to be the phrase's key word, 0 when it does not: a number (5), the
 * brand (4), a word of the scene's title (3), a Latin term in a Hebrew line (2), an emphatic
 * word or one said with "!" or "?" (1).
 */
export function keyScore(text, { title = [], brand = [] } = {}) {
  const shown = displayWord(text);
  const word = plain(shown);
  if (!word) return 0;
  if (isNumber(word, shown)) return 5;
  if (brand.some((b) => sameWord(word, b))) return 4;
  if (title.some((t) => sameWord(word, t))) return 3;
  if (/[A-Za-z]{2,}/.test(shown)) return 2;
  if (EMPHATIC.has(word) || EMPHATIC.has(unprefixed(word))) return 1;
  if (/[!?]$/.test(shown)) return 1;
  return 0;
}

/** Words of a title or a brand name, for keyScore. */
export const wordsOf = (text) =>
  String(text ?? "")
    .split(/\s+/)
    .map(plain)
    .filter((word) => word.length > 2);

/** Short words that lean on the next one: a phrase does not end on them if it can help it. */
const LEANING = new Set(
  "של את עם על אל כמו גם אם כי או בין לפני אחרי עד בלי וגם אבל כל".split(" "),
);

export const leansOnNext = (text) => LEANING.has(plain(displayWord(text)));
