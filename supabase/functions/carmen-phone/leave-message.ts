import { callerPolicyFor } from "../_shared/carmen/caller-policy/policy.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { callerLabel, notifyTeam, type SendAlert } from "./recipients.ts";
import { appendMessage, loadCall, type PhoneCall } from "./calls.ts";
import { MAX_MESSAGES_PER_CALL } from "./limits.ts";
import { loadPolicyRows } from "./store.ts";

/** The leave_message tool's arguments: the call id comes from the call, the rest from the caller. */
export type LeaveMessageArgs = {
  call_id?: unknown;
  message?: unknown;
  caller_name?: unknown;
  callback_phone?: unknown;
};

/** What the phone agent hears back. */
export type ToolResult = { ok: boolean; result: string };

const MAX_TEXT = 1000;

const LOG = "[carmen-phone]";

const NO_MESSAGES: ToolResult = {
  ok: false,
  result: "בשיחה הזו לא רושמים הודעות. הציעי לפנות לצוות ישירות.",
};

/**
 * Passes a message or request from the call to the team. Whether this caller may leave one is read
 * from the call row and the org's policy, never from the tool's arguments.
 */
export async function leaveMessage(
  db: DbClient,
  sendAlert: SendAlert,
  args: LeaveMessageArgs,
): Promise<ToolResult> {
  const message = text(args.message);
  if (!message) {
    return { ok: false, result: "לא נאמרה הודעה לרשום." };
  }
  const call = await loadCall(db, text(args.call_id));
  if (!call) {
    return { ok: false, result: "לא ניתן לרשום הודעה בשיחה הזו." };
  }
  if (!(await mayTakeMessage(db, call))) {
    return NO_MESSAGES;
  }
  // The agent calls its tools one at a time, so the count read with the call is current.
  if (call.messages.length >= MAX_MESSAGES_PER_CALL) {
    console.warn(`${LOG} message over the per-call limit refused`, {
      tenantId: call.tenantId,
      callId: call.id,
    });
    return {
      ok: false,
      result: "ההודעה כבר נרשמה, והצוות יחזור אל הפונה. אין צורך לרשום שוב.",
    };
  }
  const callerName = text(args.caller_name);
  const callback = text(args.callback_phone);
  const saved = await appendMessage(db, call, {
    message,
    caller_name: callerName || null,
    callback_phone: callback || null,
    at: new Date().toISOString(),
  });
  const delivered = await notifyTeam(
    db,
    sendAlert,
    call,
    [
      `📞 הודעה מהטלפון של כרמן`,
      `מאת: ${callerLabel(call)}${callerName ? `, הציג/ה את עצמו/ה כ${callerName}` : ""}`,
      ...(callback ? [`לחזרה: ${callback}`] : []),
      "",
      message,
    ].join("\n"),
  );
  if (delivered > 0) {
    return { ok: true, result: "ההודעה הועברה לצוות." };
  }
  if (saved) {
    return { ok: true, result: "ההודעה נרשמה, והצוות יראה אותה." };
  }
  console.error(`${LOG} message neither stored nor delivered; it is lost`, {
    tenantId: call.tenantId,
    callId: call.id,
  });
  return {
    ok: false,
    result: "לא הצלחתי לרשום את ההודעה. הציעי לפנות לצוות ישירות.",
  };
}

/**
 * Whether the call may leave a message: not a call over the hourly limit, and for a client or
 * unknown caller only when the org's policy takes messages or meetings.
 */
async function mayTakeMessage(db: DbClient, call: PhoneCall): Promise<boolean> {
  if (call.rateLimited) {
    console.warn(`${LOG} message on a rate-limited call refused`, {
      tenantId: call.tenantId,
      callId: call.id,
    });
    return false;
  }
  if (call.callerKind === "staff") {
    return true;
  }
  const policy = callerPolicyFor(
    call.callerKind,
    await loadPolicyRows(db, call.tenantId),
  );
  return policy.mayTakeMessage || policy.mayBookMeeting;
}

/** A trimmed, capped string argument, or empty. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}
