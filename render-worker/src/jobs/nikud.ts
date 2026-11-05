// Hebrew vowel points (nikud) for the voice only. The script, its captions and the word timings
// the edit cuts on stay without nikud; only the string sent to the TTS engine carries it.

/** Vowel points, dagesh, shin/sin dots and cantillation; maqaf, paseq and sof pasuq stay. */
const POINTS = /[֑-ׇֽֿׁׂׅׄ]/g;
const LETTER = /[א-ת]/;
const POINTED_LETTER = /[א-ת][֑-ׇֽֿׁׂׅׄ]/g;
/** Matres lectionis: a vocalizer may drop them (בוקר → בֹּקֶר) and still say the same word. */
const MATRES = new Set(["ו", "י"]);

/** The text without nikud. */
export const stripNikud = (text: string) => text.replace(POINTS, "");

/** True when the text has a Hebrew letter. */
export const hasHebrew = (text: string) => LETTER.test(text);

/**
 * True when at least half of the Hebrew letters carry a point. Final letters and matres take
 * none in fully pointed text, so a full-nikud script sits well above half and a plain one at 0.
 */
export function isVocalized(text: string): boolean {
  const letters = text.match(new RegExp(LETTER, "g"))?.length ?? 0;
  const pointed = text.match(POINTED_LETTER)?.length ?? 0;
  return letters > 0 && pointed / letters >= 0.5;
}

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
      if (stripNikud(run) !== run) {
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
