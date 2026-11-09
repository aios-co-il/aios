/**
 * The model's read of a client group thread (prompt.ts): does the client wait
 * for an answer or ask for something, and which of its new lines complain.
 * Only group threads are sent (staff are members there); direct-chat text
 * never leaves AIOS.
 */
import type { Json } from "../../../_shared/database.types.ts";
import { isJsonObject } from "../../../_shared/pulse/json.ts";
import { clip } from "./clip.ts";

export type ChatVerdict = {
  needs_reply: boolean;
  is_request: boolean;
  /** The client messages the model read as complaints. */
  complaint_ids: string[];
  /** The client messages this read judged (the new lines it was shown). */
  read_ids: Array<string>;
  urgency: "low" | "normal" | "high";
  summary_he: string;
  confidence: number;
};

const MAX_SUMMARY = 200;
/** Below this confidence a verdict adds nothing to the markers. */
const MIN_CONFIDENCE = 0.6;
/**
 * From this confidence a verdict that read the flagged lines may also clear
 * what the markers raised: no request, or no complaint (David, 2026-11-08).
 */
export const DROP_CONFIDENCE = 0.8;

/**
 * A verdict from the model's JSON answer, or null when malformed. Its
 * complaint_lines become message ids through `lineIds` (prompt.ts), so a
 * line the model may not judge, or a number it made up, names nothing.
 */
export function parseModelVerdict(
  text: string,
  lineIds: (string | null)[],
): ChatVerdict | null {
  const value = parseJson(text);
  const fields = verdictFields(value);
  if (!fields || !isJsonObject(value)) {
    return null;
  }
  const lines = Array.isArray(value.complaint_lines)
    ? value.complaint_lines
    : [];
  const ids = lines.flatMap((line) =>
    typeof line === "number" && Number.isInteger(line) && line > 0
      ? (lineIds[line - 1] ?? [])
      : [],
  );
  return {
    ...fields,
    complaint_ids: [...new Set(ids)],
    read_ids: lineIds.flatMap((id) => id ?? []),
  };
}

/**
 * A verdict as carmen_chat_thread_reviews keeps it, or null when malformed.
 * A review stored before read_ids existed is null too, so its thread is read
 * again and its verdict can say which lines it judged.
 */
export function parseStoredVerdict(raw: Json): ChatVerdict | null {
  const fields = verdictFields(raw);
  if (!fields || !isJsonObject(raw) || !Array.isArray(raw.read_ids)) {
    return null;
  }
  const ids = Array.isArray(raw.complaint_ids) ? raw.complaint_ids : [];
  return {
    ...fields,
    complaint_ids: ids.filter((id): id is string => typeof id === "string"),
    read_ids: raw.read_ids.filter((id): id is string => typeof id === "string"),
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

/** The messages a confident verdict reads as complaints. */
export function verdictComplaints(verdict: ChatVerdict | null): string[] {
  return verdict && verdict.confidence >= MIN_CONFIDENCE
    ? verdict.complaint_ids
    : [];
}

/**
 * True when a confident read judged every one of `turnIds` and found no
 * request and nothing to answer: the wait's markers are cleared.
 */
export function verdictClearsWait(
  verdict: ChatVerdict | null,
  turnIds: Array<string>,
): boolean {
  return (
    judgedAll(verdict, turnIds) && !verdict.is_request && !verdict.needs_reply
  );
}

/**
 * True when a confident read judged every one of `turnIds` and named none of
 * them as a complaint: the complaint words were a false alarm.
 */
export function verdictClearsComplaint(
  verdict: ChatVerdict | null,
  turnIds: Array<string>,
): boolean {
  return (
    judgedAll(verdict, turnIds) &&
    !turnIds.some((id) => verdict.complaint_ids.includes(id))
  );
}

/** A confident read that judged every one of `turnIds` (at least one). */
function judgedAll(
  verdict: ChatVerdict | null,
  turnIds: Array<string>,
): verdict is ChatVerdict {
  return (
    !!verdict &&
    verdict.confidence >= DROP_CONFIDENCE &&
    turnIds.length > 0 &&
    turnIds.every((id) => verdict.read_ids.includes(id))
  );
}

/** Every field but the complaint ids, or null when one is missing. */
function verdictFields(
  value: Json | null,
): Omit<ChatVerdict, "complaint_ids" | "read_ids"> | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const { needs_reply, is_request, urgency, summary_he } = value;
  const confidence = Number(value.confidence);
  if (
    typeof needs_reply !== "boolean" ||
    typeof is_request !== "boolean" ||
    !Number.isFinite(confidence)
  ) {
    return null;
  }
  return {
    needs_reply,
    is_request,
    urgency: urgency === "low" || urgency === "high" ? urgency : "normal",
    summary_he:
      typeof summary_he === "string" ? clip(summary_he, MAX_SUMMARY) : "",
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/** JSON.parse that returns null instead of throwing. */
function parseJson(text: string): Json | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
