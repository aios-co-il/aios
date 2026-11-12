// Rebuilds speaker turns from a word-per-line transcript before summarizing
// (AIO-582). Recall stores a word or two per line with speakers interleaved
// ("Or: אני" / "איתי: איך" / "Or: יכול"), which doubles the tokens and hides
// who said what. A short fragment joins its speaker's recent turn.

const LINE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([^:\n]{1,80}):\s?(.*)$/;
/** A fragment this short is crosstalk that belongs to an open turn. */
const SHORT_FRAGMENT_WORDS = 4;
/** How long a speaker's turn stays open for their next fragment. */
const TURN_GAP_SECONDS = 8;
/** How many recent turns a fragment may skip back over. */
const LOOKBACK_TURNS = 6;

interface Turn {
  speaker: string;
  start: number;
  last: number;
  parts: Array<string>;
  /** Opened by a full sentence, not crosstalk: a fragment never jumps back over it. */
  startedLong: boolean;
}

/**
 * One line per speaker turn, in order of each turn's start. A transcript that
 * is not in "[mm:ss] Speaker: text" lines is returned unchanged.
 */
export function compactTranscript(transcript: string): string {
  const lines = transcript.split("\n");
  const parsed = lines.map(parseLine);
  const speakerLines = parsed.filter((line) => line !== null).length;
  if (speakerLines < lines.filter((l) => l.trim()).length * 0.8) {
    return transcript;
  }

  const turns: Array<Turn> = [];
  for (const line of parsed) {
    if (!line || !line.text.trim()) {
      continue;
    }
    const open = openTurnFor(turns, line);
    if (open) {
      open.parts.push(line.text.trim());
      open.last = line.seconds;
    } else {
      turns.push({
        speaker: line.speaker,
        start: line.seconds,
        last: line.seconds,
        parts: [line.text.trim()],
        startedLong: wordCount(line.text) > SHORT_FRAGMENT_WORDS,
      });
    }
  }
  return turns
    .map(
      (turn) =>
        `[${clock(turn.start)}] ${turn.speaker}: ${turn.parts.join(" ")}`,
    )
    .join("\n");
}

/** The speaker's recent turn a line continues, or null for a new turn. */
function openTurnFor(
  turns: Array<Turn>,
  line: { speaker: string; seconds: number; text: string },
): Turn | null {
  const latest = turns.at(-1);
  if (latest?.speaker === line.speaker) {
    return latest;
  }
  if (wordCount(line.text) > SHORT_FRAGMENT_WORDS) {
    return null;
  }
  for (
    let i = turns.length - 1;
    i >= Math.max(0, turns.length - LOOKBACK_TURNS);
    i--
  ) {
    const turn = turns[i];
    if (
      turn.speaker === line.speaker &&
      line.seconds - turn.last <= TURN_GAP_SECONDS
    ) {
      return turn;
    }
    if (turn.startedLong) {
      return null;
    }
  }
  return null;
}

/** "[mm:ss] Speaker: text" as seconds, speaker and text, or null. */
function parseLine(
  raw: string,
): { seconds: number; speaker: string; text: string } | null {
  const match = raw.match(LINE);
  if (!match) {
    return null;
  }
  const [, a, b, c, speaker, text] = match;
  const seconds = c
    ? Number(a) * 3600 + Number(b) * 60 + Number(c)
    : Number(a) * 60 + Number(b);
  return { seconds, speaker: speaker.trim(), text };
}

/** Words in a fragment. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Seconds as mm:ss (h:mm:ss past an hour). */
function clock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}
