// The WhatsApp senders store send_kind / send_ref on the chat_messages row
// they write. The columns have no constraint, so the values are checked here.
// The web app imports this module too, so it stays free of Deno and browser
// APIs.
//
// Which kinds reach a client card is decided by the chat_messages trigger in
// supabase/migrations/20261030093000_client_card_system_send_log.sql. A
// service-role send that names no kind is stored with send_kind NULL and is
// never logged, so a new internal sender cannot start writing client cards by
// accident.

export const SEND_KINDS = [
  "chat",
  "report",
  "dashboard_share",
  "meeting_summary",
  "broadcast",
  "carmen",
  "automation",
  "staff_alert",
] as const;

export type SendKind = (typeof SEND_KINDS)[number];

/** Kinds a signed-in person may stamp from the browser. */
export const USER_SEND_KINDS: readonly SendKind[] = [
  "chat",
  "report",
  "dashboard_share",
  "meeting_summary",
];

export const SEND_REF_MAX_LENGTH = 200;

/**
 * The client card entry types the triggers write (source 'system_send'), with
 * their Hebrew labels. None counts as client contact:
 * get_latest_client_call_updates ignores system_send rows whatever their type.
 */
export const SYSTEM_SEND_UPDATE_TYPES = [
  { value: "report_sent", label: "דוח נשלח" },
  { value: "dashboard_shared", label: "דשבורד נשלח" },
  { value: "meeting_summary_sent", label: "סיכום פגישה נשלח" },
  { value: "broadcast_sent", label: "דיוור נשלח" },
  { value: "whatsapp_sent", label: "הודעות וואטסאפ נשלחו" },
  { value: "carmen_message", label: "הודעה מכרמן" },
  { value: "automation_message", label: "הודעת אוטומציה" },
] as const;

export type SystemSendUpdateType =
  (typeof SYSTEM_SEND_UPDATE_TYPES)[number]["value"];

/** The chat_messages columns a sender adds to its insert. */
export function sendKindColumns(input: {
  sendKind: unknown;
  sendRef: unknown;
  isServiceRole: boolean;
}): { send_kind: SendKind | null; send_ref: string | null } {
  return {
    send_kind: resolveSendKind({
      requested: input.sendKind,
      isServiceRole: input.isServiceRole,
    }),
    send_ref: normalizeSendRef(input.sendRef),
  };
}

/**
 * The send_kind to store. A browser send is `chat` unless it names one of the
 * browser kinds; a service-role send keeps the kind it names, and NULL when it
 * names none or an unknown one.
 */
export function resolveSendKind(input: {
  requested: unknown;
  isServiceRole: boolean;
}): SendKind | null {
  const requested =
    typeof input.requested === "string" ? input.requested.trim() : "";
  if (input.isServiceRole) {
    return isSendKind(requested) ? requested : null;
  }
  return isSendKind(requested) && USER_SEND_KINDS.includes(requested)
    ? requested
    : "chat";
}

/** A short free-form reference (report, dashboard, recording or broadcast id). */
export function normalizeSendRef(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const ref = String(value).trim();
  if (!ref) {
    return null;
  }
  return ref.slice(0, SEND_REF_MAX_LENGTH);
}

/** Whether a value is one of SEND_KINDS. */
export function isSendKind(value: unknown): value is SendKind {
  return SEND_KINDS.some((kind) => kind === value);
}
