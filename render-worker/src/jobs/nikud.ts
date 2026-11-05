// Hebrew vowel points (nikud) for the voice only. The script, its captions and the word timings
// the edit cuts on stay without nikud; only the string sent to the TTS engine carries it.

/**
 * Vowel points, dagesh, shin/sin dots and cantillation; maqaf (U+05BE), paseq (U+05C0) and sof
 * pasuq (U+05C3) stay. The edge quote keeps a copy of these classes and the per-word rule
 * (supabase/functions/_shared/workshop/clip-prices.ts voiceCharacters); change both together.
 */
const POINTS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
const LETTER = /[\u05D0-\u05EA]/;
const POINTED_LETTER =
  /[\u05D0-\u05EA][\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;
/** Matres lectionis: a vocalizer may drop them (בוקר → בֹּקֶר) and still say the same word. */
const MATRES = new Set(["ו", "י"]);

/** The text without nikud. */
export const stripNikud = (text: string) => text.replace(POINTS, "");

/** True when the text has a Hebrew letter. */
export const hasHebrew = (text: string) => LETTER.test(text);

/**
 * True when every Hebrew word already carries a point. A script that left even one word plain
 * (שֶׁלָּנוּ פה) still goes to the vocalizer, which then points only the plain words.
 */
export function isVocalized(text: string): boolean {
  const words = hebrewWords(text);
  return words.length > 0 && words.every(isPointedWord);
}

/** The whitespace-separated words that have a Hebrew letter. */
const hebrewWords = (text: string) =>
  text.split(/\s+/).filter((word) => LETTER.test(word));

/** True when a Hebrew letter in the word carries a point. */
const isPointedWord = (word: string) => POINTED_LETTER.test(word);

/**
 * The script with each word replaced by its pointed form from `candidate`, or null when the
 * candidate has a different number of words. A word keeps its own spelling when the candidate
 * changed more than nikud and dropped matres (a different word, other punctuation, an added
 * mater that makes בת into בַּיִת), or when the script
 * already pointed it. Whitespace always comes from the script, so the word runs line up for
 * spokenAlignment.
 */
export function mergeVocalized(script: string, candidate: string) {
  const pointed = candidate.split(/\s+/).filter(Boolean);
  const runs = script.match(/\s+|\S+/g) ?? [];
  if (runs.filter((run) => /\S/.test(run)).length !== pointed.length) {
    return null;
  }
  let at = 0;
  return runs
    .map((run) => {
      if (!/\S/.test(run)) {
        return run;
      }
      const word = pointed[at++];
      if (isPointedWord(run)) {
        return run;
      }
      return sameWord(run, word) ? word : run;
    })
    .join("");
}

/**
 * True when the pointed candidate spells the script word with nothing changed but some ו/י
 * left out: its plain letters are the script's, in order, missing only matres. A candidate
 * that adds a letter (בת → בַּיִת) is another word.
 */
export function sameWord(script: string, candidate: string): boolean {
  const written = Array.from(stripNikud(script).normalize("NFC"));
  const said = Array.from(stripNikud(candidate).normalize("NFC"));
  let at = 0;
  for (const letter of written) {
    if (letter === said[at]) {
      at++;
    } else if (!MATRES.has(letter)) {
      return false;
    }
  }
  return at === said.length;
}
