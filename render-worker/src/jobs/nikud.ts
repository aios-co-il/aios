// Hebrew vowel points (nikud) for the voice only. The script, its captions and the word timings
// the edit cuts on stay without nikud; only the string sent to the TTS engine carries it.
import type { SpeechAlignment } from "../providers/responses.ts";

/** Vowel points, dagesh, shin/sin dots and cantillation; maqaf, paseq and sof pasuq stay. */
const POINTS = /[֑-ׇֽֿׁׂׅׄ]/g;
const LETTER = /[א-ת]/;
const POINTED_LETTER = /[א-ת][֑-ׇֽֿׁׂׅׄ]/g;
/** Matres lectionis: a vocalizer may drop or add them (בוקר → בֹּקֶר) and still say the word. */
const MATRES = /[וי]/g;

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
 * changed more than nikud and matres (a different word, other punctuation), or when the script
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
      return spelling(word) === spelling(run) ? word : run;
    })
    .join("");
}

/** A word's letters and punctuation without nikud or matres. */
const spelling = (word: string) => stripNikud(word).replace(MATRES, "");

/**
 * The TTS character timings re-keyed to the script. The engine timed `spoken` (the pointed
 * text); captions and line-sync read the script, so each script word takes the span its pointed
 * word was said in, shared by its letters. When the runs do not line up, the points are removed
 * from the timed characters instead.
 */
export function spokenAlignment(
  alignment: SpeechAlignment | null,
  spoken: string,
  script: string,
): SpeechAlignment | null {
  if (!alignment || spoken === script) {
    return alignment;
  }
  return alignmentByRuns(alignment, spoken, script) ?? withoutPoints(alignment);
}

/** Script characters timed by the run of the spoken text they stand for, or null. */
function alignmentByRuns(
  alignment: SpeechAlignment,
  spoken: string,
  script: string,
): SpeechAlignment | null {
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];
  if (chars.join("") !== spoken || starts.length !== chars.length) {
    return null;
  }
  const spokenRuns = spoken.match(/\s+|\S+/g) ?? [];
  const scriptRuns = script.match(/\s+|\S+/g) ?? [];
  if (spokenRuns.length !== scriptRuns.length) {
    return null;
  }
  const out: SpeechAlignment = {
    characters: [],
    character_start_times_seconds: [],
    character_end_times_seconds: [],
  };
  let entry = 0;
  for (let index = 0; index < spokenRuns.length; index++) {
    const first = entry;
    let covered = 0;
    while (covered < spokenRuns[index].length && entry < chars.length) {
      covered += chars[entry++].length;
    }
    if (covered !== spokenRuns[index].length) {
      return null;
    }
    const start = Number(starts[first]);
    const end = Number(ends[entry - 1]);
    const letters = Array.from(scriptRuns[index]);
    letters.forEach((letter, at) => {
      out.characters.push(letter);
      out.character_start_times_seconds.push(
        start + ((end - start) * at) / letters.length,
      );
      out.character_end_times_seconds.push(
        start + ((end - start) * (at + 1)) / letters.length,
      );
    });
  }
  return out;
}

/** The timed characters with their points removed; a bare point extends the letter before it. */
function withoutPoints(alignment: SpeechAlignment): SpeechAlignment {
  const out: SpeechAlignment = {
    characters: [],
    character_start_times_seconds: [],
    character_end_times_seconds: [],
  };
  (alignment.characters ?? []).forEach((char, index) => {
    const bare = stripNikud(String(char ?? ""));
    const last = out.characters.length - 1;
    if (!bare) {
      if (last >= 0) {
        out.character_end_times_seconds[last] = Math.max(
          out.character_end_times_seconds[last],
          Number(alignment.character_end_times_seconds?.[index]),
        );
      }
      return;
    }
    out.characters.push(bare);
    out.character_start_times_seconds.push(
      Number(alignment.character_start_times_seconds?.[index]),
    );
    out.character_end_times_seconds.push(
      Number(alignment.character_end_times_seconds?.[index]),
    );
  });
  return out;
}
