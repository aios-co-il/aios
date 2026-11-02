/**
 * The Hebrew line staff receive for a chat finding. A group open to the team
 * (staff write there) is quoted (at most QUOTE_MAX characters). A direct
 * chat, or a group no team member writes in, is never quoted: the line
 * carries only the time and a link to the chat.
 */
import { clip } from "./clip.ts";
import { israelDayAndClock } from "./israel-time.ts";
import { onlyAcknowledgements, readMarkers } from "./markers.ts";
import type { Thread, Turn } from "./threads.ts";

const QUOTE_MAX = 200;
/** carmen_findings.summary_he holds at most this many characters. */
export const SUMMARY_MAX = 500;

type Marker = "request" | "complaint";

/** "<client>: הלקוח כתב … ועדיין לא קיבל מענה (N שעות עסקיות)". */
export function requestSummary(
  thread: Thread,
  waitingHours: number,
  link: string | null,
): string {
  const since = thread.pending[0]?.at;
  const where = place(thread, thread.pending, "request", since);
  return clip(
    `${thread.clientName}: הלקוח כתב ${where} ועדיין לא קיבל מענה (${hoursText(waitingHours)})${unsureText(thread.pending)}${linkText(link)}`,
    SUMMARY_MAX,
  );
}

/** "<client>: נראה שהלקוח מתלונן …", for the client turns `turns`. */
export function complaintSummary(
  thread: Thread,
  turns: Turn[],
  link: string | null,
): string {
  const where = place(
    thread,
    turns,
    "complaint",
    markedTurn(turns, "complaint")?.at,
  );
  return clip(
    `${thread.clientName}: נראה שהלקוח מתלונן ${where}${unsureText(turns)}${linkText(link)}`,
    SUMMARY_MAX,
  );
}

/** The client message to quote (groups open to the team only), cut to QUOTE_MAX. */
export function quoteOf(
  thread: Thread,
  turns: Turn[],
  marker: Marker,
): string | null {
  if (!thread.openToTeam) {
    return null;
  }
  const text = (markedTurn(turns, marker)?.text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? clip(text, QUOTE_MAX) : null;
}

/** True when every turn came from an @lid sender wa_lid_map cannot resolve. */
export function isLowConfidence(turns: Turn[]): boolean {
  return turns.every((turn) => turn.unsure);
}

/** "בקבוצה <time>: "<quote>"" or "בהודעה פרטית <time>". */
function place(
  thread: Thread,
  turns: Turn[],
  marker: Marker,
  at: Date | undefined,
): string {
  if (thread.kind !== "group") {
    return `בהודעה פרטית ${when(at)}`;
  }
  const quote = quoteOf(thread, turns, marker);
  return `בקבוצה ${when(at)}${quote ? `: "${quote}"` : ""}`;
}

/**
 * The latest turn with the marker. Without one (a model verdict found it),
 * the latest turn that says more than thanks, since the client may have
 * thanked after the line the model read; else the latest turn.
 */
function markedTurn(turns: Turn[], marker: Marker): Turn | undefined {
  return (
    turns.findLast((turn) => readMarkers([turn.text])[marker]) ??
    turns.findLast((turn) => !onlyAcknowledgements([turn.text])) ??
    turns.at(-1)
  );
}

/** "ב-27.10 בשעה 21:14", or nothing without a time. */
function when(at: Date | undefined): string {
  return at ? israelDayAndClock(at) : "";
}

/** "שעה עסקית" / "N שעות עסקיות". */
function hoursText(hours: number): string {
  const whole = Math.floor(hours);
  return whole <= 1 ? "שעה עסקית" : `${whole} שעות עסקיות`;
}

/** A note when the writer may be staff on a number the system cannot read. */
function unsureText(turns: Turn[]): string {
  return isLowConfidence(turns) ? " (השולח לא זוהה בוודאות)" : "";
}

/** " – לצ׳אט: <link>", or nothing without a link. */
function linkText(link: string | null): string {
  return link ? ` – לצ׳אט: ${link}` : "";
}
