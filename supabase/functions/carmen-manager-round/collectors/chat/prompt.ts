/**
 * The prompt for the cheap LLM read of a client group thread. The transcript
 * carries roles and Israel times, never phones or names. Every line is
 * numbered and the client lines the model has not judged before are marked,
 * so the answer names the line that complains, not just the thread.
 */
import { israelClock } from "./israel-time.ts";
import type { Turn } from "./threads.ts";

/** At most this many turns and characters go to the model. */
const MAX_TURNS = 15;
const MAX_CHARS = 2_000;
/** Room for a line's number and new-line mark ("[15*] "). */
const NUMBER_WIDTH = 6;

const INSTRUCTIONS = [
  "You read a WhatsApp group between a digital marketing agency (צוות) and its client (לקוח).",
  "Lines are numbered. Client lines marked * are new: only they can be complaint lines.",
  "needs_reply and is_request are about the client's lines after the agency's last line: is the client waiting for an answer, or asking for something to be done.",
  "complaint_lines: the numbers of the new (*) client lines that complain about the agency, its work or its results, or say the client may leave; [] when none.",
  'Answer in JSON only: {"needs_reply": boolean, "is_request": boolean, "complaint_lines": number[], "urgency": "low" | "normal" | "high", "summary_he": "one short Hebrew line: the complaint if there is one, else what the client asks for", "confidence": number between 0 and 1}.',
  "Thanks, greetings and emoji need no reply and are no complaint.",
];

export type VerdictPrompt = {
  text: string;
  /** Line n's message id at index n - 1 when it is a new client line, else null. */
  lineIds: (string | null)[];
};

/** The prompt for a thread's newest turns; `fresh` holds the new client lines. */
export function verdictPrompt(
  turns: Turn[],
  fresh: ReadonlySet<string>,
): VerdictPrompt {
  const shown = newestThatFit(turns);
  const lines = shown.map((turn, index) => {
    const mark = fresh.has(turn.id) ? "*" : "";
    return `[${index + 1}${mark}] ${body(turn)}`;
  });
  return {
    text: [...INSTRUCTIONS, "", ...lines].join("\n"),
    lineIds: shown.map((turn) => (fresh.has(turn.id) ? turn.id : null)),
  };
}

/** The newest turns whose lines fit the character budget, oldest first. */
function newestThatFit(turns: Turn[]): Turn[] {
  const shown: Turn[] = [];
  let used = 0;
  for (const turn of turns.slice(-MAX_TURNS).reverse()) {
    const size = NUMBER_WIDTH + body(turn).length;
    if (used + size > MAX_CHARS) {
      break;
    }
    shown.unshift(turn);
    used += size + 1;
  }
  return shown;
}

/** "09:05 לקוח: <text>", with a marker for a call. */
function body(turn: Turn): string {
  const role = turn.by === "staff" ? "צוות" : "לקוח";
  const text = turn.via === "call" ? "[שיחת טלפון עם הלקוח]" : turn.text;
  return `${israelClock(turn.at)} ${role}: ${text}`;
}
