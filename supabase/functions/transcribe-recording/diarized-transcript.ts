import type { DiarizedSegment } from "../_shared/ai.ts";

/**
 * Formats Scribe's diarized segments as one line per speaker turn,
 * `[mm:ss] דובר N: text`, numbering speakers by first appearance. Text is kept
 * exactly as Scribe returned it: the transcript must stay verbatim.
 */
export function formatDiarizedTranscript(
  segments: Array<DiarizedSegment>,
): string {
  const speakerNumbers = new Map<string, number>();

  return segments
    .map((segment) => {
      if (!speakerNumbers.has(segment.speaker)) {
        speakerNumbers.set(segment.speaker, speakerNumbers.size + 1);
      }
      const label = `דובר ${speakerNumbers.get(segment.speaker)}`;
      return `[${formatClock(segment.start)}] ${label}: ${segment.text}`;
    })
    .join("\n");
}

/** Formats seconds as `mm:ss`, or `h:mm:ss` from one hour on. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
