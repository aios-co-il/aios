/**
 * The Hebrew lines of the contact findings: the one-line summary staff get
 * word for word (it names the client) and the card entry a confirmed reply
 * logs. No message text ever; a meeting draft quotes at most
 * DRAFT_QUOTE_CHARS of the recording summary.
 */
import {
  CONFIRM_DRAFT_WORD_HE,
  type ContactDraft,
} from "../../../_shared/manager-round/contact-draft.ts";
import { dayMonth } from "../../calendar/day-month.ts";
import type { CallEvidence, MeetingEvidence } from "./evidence.ts";

/** carmen_findings.summary_he holds at most this many characters. */
const SUMMARY_MAX = 500;
const DRAFT_QUOTE_CHARS = 400;
const REPLY_HINT = `לתיעוד השיבו "${CONFIRM_DRAFT_WORD_HE}" ומספר הפריט`;

/** An unlogged call; an office-line call names nobody. */
export function callSummary(clientName: string, call: CallEvidence): string {
  const when = `${dayMonth(new Date(call.at))}, ${minutes(call.seconds)} דק'`;
  if (!call.attributedUserId) {
    return clip(
      `${clientName}: שיחה מקו המשרד, נציג לא מזוהה (${when}). השיחה לא תועדה בכרטיס. ${REPLY_HINT}`,
    );
  }
  const who = call.attributedName ? ` של ${call.attributedName}` : "";
  return clip(
    `${clientName}: שיחה${who} עם הלקוח (${when}) לא תועדה בכרטיס. ${REPLY_HINT}`,
  );
}

/** An unlogged meeting, mentioning the draft taken from its recording summary. */
export function meetingSummary(
  clientName: string,
  meeting: MeetingEvidence,
): string {
  const draft = meeting.summary ? "יש טיוטה מסיכום ההקלטה. " : "";
  return clip(
    `${clientName}: הפגישה מ־${dayMonth(new Date(meeting.at))} לא תועדה בכרטיס. ${draft}${REPLY_HINT}`,
  );
}

/** A client nobody contacted, with the last contact when it is known. */
export function noContactSummary(
  clientName: string,
  lastContactAt: Date | null,
  days: number,
): string {
  return clip(
    lastContactAt
      ? `${clientName}: אין שיחה, פגישה או הודעה מתועדת עם הלקוח מאז ${dayMonth(lastContactAt)}`
      : `${clientName}: אין שיחה, פגישה או הודעה מתועדת עם הלקוח ב־${days} הימים האחרונים`,
  );
}

/** The card entry for a call. */
export function callDraft(call: CallEvidence): ContactDraft {
  return {
    update_type: "call",
    text_he: `שיחה טלפונית עם הלקוח ב־${dayMonth(new Date(call.at))} (${minutes(call.seconds)} דק')`,
  };
}

/** The card entry for a meeting, from its recording summary when there is one. */
export function meetingDraft(meeting: MeetingEvidence): ContactDraft {
  const head = `פגישה עם הלקוח ב־${dayMonth(new Date(meeting.at))}`;
  const quote = meeting.summary ? plain(meeting.summary) : "";
  return {
    update_type: "meeting",
    text_he: quote ? `${head}. סיכום: ${quote}` : head,
  };
}

/** Whole minutes, at least one. */
function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** Markdown-free single-line text, cut to DRAFT_QUOTE_CHARS. */
function plain(markdown: string): string {
  const flat = markdown
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > DRAFT_QUOTE_CHARS
    ? `${flat.slice(0, DRAFT_QUOTE_CHARS - 1)}…`
    : flat;
}

/** A summary within the column's limit. */
function clip(summary: string): string {
  return summary.length > SUMMARY_MAX
    ? `${summary.slice(0, SUMMARY_MAX - 1)}…`
    : summary;
}
