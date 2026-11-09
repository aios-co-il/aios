import { callerPolicyFor } from "../_shared/carmen/caller-policy/policy.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { callerLabel, notifyTeam, type SendAlert } from "./recipients.ts";
import { appendMessage, loadCall } from "./calls.ts";
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
  if (call.callerKind !== "staff") {
    const policy = callerPolicyFor(
      call.callerKind,
      await loadPolicyRows(db, call.tenantId),
    );
    if (!policy.mayTakeMessage && !policy.mayBookMeeting) {
      return {
        ok: false,
        result: "בשיחה הזו לא רושמים הודעות. הציעי לפנות לצוות ישירות.",
      };
    }
  }
  const callerName = text(args.caller_name);
  const callback = text(args.callback_phone);
  await appendMessage(db, call, {
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
  return delivered > 0
    ? { ok: true, result: "ההודעה הועברה לצוות." }
    : { ok: true, result: "ההודעה נרשמה, והצוות יראה אותה." };
}

/** A trimmed, capped string argument, or empty. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}
