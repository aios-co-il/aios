// What kind of system send a chat_messages row is (AIO-242, plan C5).
//
// The WhatsApp senders (send-green-api-message, send-manus-wa-message,
// send-meta-whatsapp-message, send-green-api-file, send-manus-wa-file) store
// `send_kind` / `send_ref` on the chat_messages row they write. The columns
// have no constraint; the values are checked here. Shared by the edge
// functions and the web app, so keep it free of Deno and browser APIs.
//
// The chat_messages AFTER INSERT trigger
// (supabase/migrations/20261026136000_client_card_system_send_log.sql) logs a
// client card entry only for CARD_LOGGED_SEND_KINDS. Reports, dashboard shares
// and meeting summaries are logged once, from report_deliveries, never from
// chat_messages; staff alerts never reach a client card. A service-role send
// that names no kind is stored with send_kind NULL and is never logged, so a
// new internal sender cannot start writing client cards by accident.

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

/** Kinds the chat_messages trigger turns into client card entries. */
export const CARD_LOGGED_SEND_KINDS: readonly SendKind[] = [
  "chat",
  "broadcast",
  "carmen",
  "automation",
];

/**
 * Kinds the chat_messages trigger skips: report_deliveries is their only
 * logger, and staff alerts are not client contact at all.
 */
export const CARD_SKIPPED_SEND_KINDS: readonly SendKind[] = [
  "report",
  "dashboard_share",
  "meeting_summary",
  "staff_alert",
];

/** Kinds logged even when the row has no sent_by_user_id. */
export const CARD_LOGGED_WITHOUT_SENDER: readonly SendKind[] = [
  "carmen",
  "automation",
];

export const SEND_REF_MAX_LENGTH = 200;

export function isSendKind(value: unknown): value is SendKind {
  return (
    typeof value === "string" &&
    (SEND_KINDS as readonly string[]).includes(value)
  );
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
  if (input.isServiceRole) return isSendKind(requested) ? requested : null;
  return isSendKind(requested) && USER_SEND_KINDS.includes(requested)
    ? requested
    : "chat";
}

/** A short free-form reference (report, dashboard, recording or broadcast id). */
export function normalizeSendRef(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const ref = String(value).trim();
  if (!ref) return null;
  return ref.slice(0, SEND_REF_MAX_LENGTH);
}

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

// ── Client card entries written by the two triggers ────────────────────────

/**
 * update_type values the triggers write (source 'system_send'). None of them
 * counts as client contact: get_latest_client_call_updates ignores
 * system_send rows whatever their type.
 */
export const SYSTEM_SEND_UPDATE_TYPES = {
  report_sent: "report_sent",
  dashboard_shared: "dashboard_shared",
  meeting_summary_sent: "meeting_summary_sent",
  broadcast_sent: "broadcast_sent",
  whatsapp_sent: "whatsapp_sent",
  carmen_message: "carmen_message",
  automation_message: "automation_message",
} as const;

export type SystemSendUpdateType =
  (typeof SYSTEM_SEND_UPDATE_TYPES)[keyof typeof SYSTEM_SEND_UPDATE_TYPES];

/** Hebrew labels for the client card history. */
export const SYSTEM_SEND_UPDATE_TYPE_LABELS: Record<
  SystemSendUpdateType,
  string
> = {
  report_sent: "דוח נשלח",
  dashboard_shared: "דשבורד נשלח",
  meeting_summary_sent: "סיכום פגישה נשלח",
  broadcast_sent: "דיוור נשלח",
  whatsapp_sent: "הודעות וואטסאפ נשלחו",
  carmen_message: "הודעה מכרמן",
  automation_message: "הודעת אוטומציה",
};
