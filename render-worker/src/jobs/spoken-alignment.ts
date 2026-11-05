// The TTS engine timed the pointed text it was sent; captions and line-sync read the script
// without nikud. These re-key the engine's character timings to the script.
import type { SpeechAlignment } from "../providers/responses.ts";
import { stripNikud } from "./nikud.ts";

/**
 * The TTS character timings re-keyed to the script. Each script word takes the span its pointed
 * word was said in, shared by its letters, so captions always show the script's spelling. When
 * the timed text does not line up with the spoken one, the points are removed from the timed
 * characters and the words are matched by count; only when the counts differ too do the bare
 * timed characters stand as they are.
 */
export function spokenAlignment(
  alignment: SpeechAlignment | null,
  spoken: string,
  script: string,
): SpeechAlignment | null {
  if (!alignment || spoken === script) {
    return alignment;
  }
  const byRuns = alignmentByRuns(alignment, spoken, script);
  if (byRuns) {
    return byRuns;
  }
  const bare = withoutPoints(alignment);
  return alignmentByWords(bare, script) ?? bare;
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
  // Dicta and the engine may order a letter's points differently; NFC puts both in one order
  // without changing any length (Hebrew has no precomposed pointed letters in NFC).
  const said = spoken.normalize("NFC");
  if (
    chars.join("").normalize("NFC") !== said ||
    starts.length !== chars.length
  ) {
    return null;
  }
  const spokenRuns = said.match(/\s+|\S+/g) ?? [];
  const scriptRuns = script.match(/\s+|\S+/g) ?? [];
  if (spokenRuns.length !== scriptRuns.length) {
    return null;
  }
  const out = emptyAlignment();
  let entry = 0;
  for (let index = 0; index < spokenRuns.length; index++) {
    const first = entry;
    let covered = 0;
    while (covered < spokenRuns[index].length && entry < chars.length) {
      covered += chars[entry++].normalize("NFC").length;
    }
    if (covered !== spokenRuns[index].length) {
      return null;
    }
    spread(
      out,
      scriptRuns[index],
      Number(starts[first]),
      Number(ends[entry - 1]),
    );
  }
  return out;
}

/**
 * The script's words laid over the timed words, one for one, or null when the counts differ.
 * Whitespace takes the gap between the words around it.
 */
function alignmentByWords(
  bare: SpeechAlignment,
  script: string,
): SpeechAlignment | null {
  const timed = timedWords(bare);
  const scriptRuns = script.match(/\s+|\S+/g) ?? [];
  if (
    timed.length === 0 ||
    scriptRuns.filter((run) => /\S/.test(run)).length !== timed.length
  ) {
    return null;
  }
  const out = emptyAlignment();
  let at = 0;
  let lastEnd = timed[0].start;
  for (const run of scriptRuns) {
    if (/\S/.test(run)) {
      spread(out, run, timed[at].start, timed[at].end);
      lastEnd = timed[at++].end;
    } else {
      spread(out, run, lastEnd, timed[at]?.start ?? lastEnd);
    }
  }
  return out;
}

/** Each run of timed non-space characters, with when it starts and ends. */
function timedWords(alignment: SpeechAlignment) {
  const words: Array<{ start: number; end: number }> = [];
  let inWord = false;
  alignment.characters.forEach((char, index) => {
    if (/^\s*$/.test(char)) {
      inWord = false;
      return;
    }
    const start = Number(alignment.character_start_times_seconds[index]);
    const end = Number(alignment.character_end_times_seconds[index]);
    if (inWord) {
      words[words.length - 1].end = end;
    } else {
      words.push({ start, end });
    }
    inWord = true;
  });
  return words;
}

/** Appends `text`'s characters, sharing the span from `start` to `end` evenly between them. */
function spread(
  out: SpeechAlignment,
  text: string,
  start: number,
  end: number,
) {
  const letters = Array.from(text);
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

/** An alignment with no characters yet. */
const emptyAlignment = (): SpeechAlignment => ({
  characters: [],
  character_start_times_seconds: [],
  character_end_times_seconds: [],
});

/** The timed characters with their points removed; a bare point extends the letter before it. */
function withoutPoints(alignment: SpeechAlignment): SpeechAlignment {
  const out = emptyAlignment();
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
