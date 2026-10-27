/**
 * The cheap LLM read of a client group thread: does the client wait for an
 * answer, ask for something, or complain. Only group threads are sent (staff
 * are members there); direct-chat text never leaves AIOS. The transcript
 * carries roles and times, never phones or names.
 */
import type { Json } from "../../../_shared/database.types.ts";
import { clip } from "./clip.ts";
import { israelClock } from "./israel-time.ts";
import type { Turn } from "./threads.ts";

export type ChatVerdict = {
  needs_reply: boolean;
  is_request: boolean;
  is_complaint: boolean;
  urgency: "low" | "normal" | "high";
  summary_he: string;
  confidence: number;
};

/** At most this many turns and characters go to the model. */
const MAX_TURNS = 15;
const MAX_CHARS = 2_000;
const MAX_SUMMARY = 200;
/** Below this confidence a verdict adds nothing to the markers. */
const MIN_CONFIDENCE = 0.6;

/** The prompt for one thread's recent turns. */
export function verdictPrompt(turns: Turn[]): string {
  return [
    "You read a WhatsApp group between a digital marketing agency (צוות) and its client (לקוח).",
    "Look at the client's latest messages: the last client (לקוח) lines, which the agency may have answered already.",
    "Decide whether the client is waiting for an answer, asks for something to be done, or complains.",
    'Answer in JSON only: {"needs_reply": boolean, "is_request": boolean, "is_complaint": boolean, "urgency": "low" | "normal" | "high", "summary_he": "one short Hebrew line", "confidence": number between 0 and 1}.',
    "Thanks, greetings and emoji need no reply.",
    "",
    ...transcript(turns),
  ].join("\n");
}

/** A verdict from the model's JSON text or a cached row, or null when malformed. */
export function parseVerdict(raw: string | Json | null): ChatVerdict | null {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const { needs_reply, is_request, is_complaint, urgency, summary_he } = value;
  const confidence = Number(value.confidence);
  if (
    typeof needs_reply !== "boolean" ||
    typeof is_request !== "boolean" ||
    typeof is_complaint !== "boolean" ||
    !Number.isFinite(confidence)
  ) {
    return null;
  }
  return {
    needs_reply,
    is_request,
    is_complaint,
    urgency: urgency === "low" || urgency === "high" ? urgency : "normal",
    summary_he:
      typeof summary_he === "string" ? clip(summary_he, MAX_SUMMARY) : "",
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/** True when a confident verdict says the client asks or waits for an answer. */
export function verdictSaysRequest(verdict: ChatVerdict | null): boolean {
  return (
    !!verdict &&
    verdict.confidence >= MIN_CONFIDENCE &&
    (verdict.is_request || verdict.needs_reply)
  );
}

/** True when a confident verdict says the client complains. */
export function verdictSaysComplaint(verdict: ChatVerdict | null): boolean {
  return (
    !!verdict && verdict.confidence >= MIN_CONFIDENCE && verdict.is_complaint
  );
}

/** The newest turns that fit the character budget, oldest first. */
function transcript(turns: Turn[]): string[] {
  const lines: string[] = [];
  let used = 0;
  for (const turn of turns.slice(-MAX_TURNS).reverse()) {
    const line = `${israelClock(turn.at)} ${turn.by === "staff" ? "צוות" : "לקוח"}: ${turnText(turn)}`;
    if (used + line.length > MAX_CHARS) {
      break;
    }
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines;
}

/** A message's text, or a marker for a call. */
function turnText(turn: Turn): string {
  return turn.via === "call" ? "[שיחת טלפון עם הלקוח]" : turn.text;
}

/** JSON.parse that returns null instead of throwing. */
function parseJson(text: string): Json | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
