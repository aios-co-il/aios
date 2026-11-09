import { resolveCalendarAccessToken } from "./calendar-access-token.ts";
import type { CancelCalendarInviteArgs } from "./calendar-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { providerErrorMessage } from "../tool-contracts-admin.ts";

/** Preserves the existing cancel_calendar_invite executor and side-effect order. */
export async function executeCancelCalendarInvite(
  args: CancelCalendarInviteArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, callerCampaignerId } = context;

  if (args.confirmed !== true) {
    return {
      error: "not_confirmed",
      message:
        "אישור משתמש מפורש נדרש. שאלי לפני ביטול ושלחי confirmed=true רק אחרי שהוא אישר.",
    };
  }
  const { event_id } = args;
  if (!event_id) {
    return {
      error: "event_id נדרש — מצאי אותו קודם עם list_calendar_events",
    };
  }
  const cal = await resolveCalendarAccessToken(
    supabase,
    tenantId,
    callerCampaignerId ?? null,
    userId,
  );
  if (cal.error || !cal.accessToken) {
    return { error: cal.error };
  }
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(String(event_id))}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cal.accessToken}` },
    },
  );
  if (!resp.ok && resp.status !== 204 && resp.status !== 410) {
    const data: unknown = await resp.json().catch(() => ({}));
    return {
      error: `שגיאת Google Calendar: ${providerErrorMessage(data) || resp.status}`,
    };
  }
  return {
    success: true,
    message: "האירוע בוטל — המשתתפים קיבלו הודעת ביטול.",
  };
}
