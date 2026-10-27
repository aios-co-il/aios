/**
 * The Hebrew line staff receive for a chat finding. A group wait quotes the
 * client (at most 200 characters; the campaigner is in that group). A direct
 * chat is never quoted: the line carries only the time and a link to the
 * chat.
 */
import type { ThreadReview } from "./gate.ts";
import { israelDayAndClock } from "./israel-time.ts";
import { readMarkers } from "./markers.ts";
import type { Turn } from "./threads.ts";

const QUOTE_MAX = 200;
const SUMMARY_MAX = 500;

/** "<client>: הלקוח כתב … ועדיין לא קיבל מענה (N שעות עסקיות)". */
export function requestSummary(
  review: ThreadReview,
  link: string | null,
): string {
  const { thread } = review;
  const since = when(thread.pending[0]?.at);
  const waited = hoursText(review.waitingHours);
  const where =
    thread.kind === "group"
      ? `בקבוצה ${since}${quoted(review, "request")}`
      : `בהודעה פרטית ${since}`;
  return fit(
    `${thread.clientName}: הלקוח כתב ${where} ועדיין לא קיבל מענה (${waited})${unsureText(review)}${linkText(link)}`,
  );
}

/** "<client>: נראה שהלקוח מתלונן …". */
export function complaintSummary(
  review: ThreadReview,
  link: string | null,
): string {
  const { thread } = review;
  const at = when(markedTurn(review, "complaint")?.at);
  const where =
    thread.kind === "group"
      ? `בקבוצה ${at}${quoted(review, "complaint")}`
      : `בהודעה פרטית ${at}`;
  return fit(
    `${thread.clientName}: נראה שהלקוח מתלונן ${where}${unsureText(review)}${linkText(link)}`,
  );
}

/** The client message to quote (group threads only), cut to 200 characters. */
export function quoteOf(
  review: ThreadReview,
  marker: "request" | "complaint",
): string | null {
  if (review.thread.kind !== "group") {
    return null;
  }
  const text = (markedTurn(review, marker)?.text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return null;
  }
  return text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text;
}

/** True when every waiting message came from an @lid sender wa_lid_map cannot resolve. */
export function isLowConfidence(review: ThreadReview): boolean {
  return review.thread.pending.every((turn) => turn.unsure);
}

/** `: "<quote>"` for a group wait with text, else nothing. */
function quoted(review: ThreadReview, marker: "request" | "complaint"): string {
  const quote = quoteOf(review, marker);
  return quote ? `: "${quote}"` : "";
}

/** The latest waiting message with the marker, else the latest waiting message. */
function markedTurn(
  review: ThreadReview,
  marker: "request" | "complaint",
): Turn | undefined {
  const { pending } = review.thread;
  const marked = pending.filter((turn) => readMarkers([turn.text])[marker]);
  return marked.at(-1) ?? pending.at(-1);
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
function unsureText(review: ThreadReview): string {
  return isLowConfidence(review) ? " (השולח לא זוהה בוודאות)" : "";
}

/** " – לצ׳אט: <link>", or nothing without a link. */
function linkText(link: string | null): string {
  return link ? ` – לצ׳אט: ${link}` : "";
}

/** The finding text limit (carmen_findings.summary_he). */
function fit(text: string): string {
  return text.length > SUMMARY_MAX
    ? `${text.slice(0, SUMMARY_MAX - 1)}…`
    : text;
}
