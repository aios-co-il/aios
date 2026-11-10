import { makeZoomMeetingCreator } from "./calendar-zoom.ts";
import { resolveCalendarConferenceExtras } from "./calendar-conference.ts";
import { resolveCalendarAccessToken } from "./calendar-access-token.ts";
import type { UpdateCalendarInviteArgs } from "./calendar-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { updateExistingCalendarEvent } from "../../_shared/calendar-conference.ts";

/** Preserves the existing update_calendar_invite executor and side-effect order. */
export async function executeUpdateCalendarInvite(
  args: UpdateCalendarInviteArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, callerCampaignerId } = context;

  const { event_id, date, time, duration_minutes, title, notes } = args;
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
  const extras = await resolveCalendarConferenceExtras(
    supabase,
    tenantId,
    args,
  );

  const fieldPatch: Record<string, unknown> = {};
  if (title) {
    fieldPatch.summary = title;
  }
  if (notes) {
    fieldPatch.description = notes;
  }
  if (date || time) {
    if (!date || !time) {
      return { error: "לעדכון מועד יש לספק גם date וגם time" };
    }
    const startNaive = `${date}T${time}:00`;
    const endNaive = new Date(
      Date.parse(`${startNaive}Z`) +
        (Number(duration_minutes) > 0 ? Number(duration_minutes) : 60) * 60_000,
    )
      .toISOString()
      .slice(0, 19);
    fieldPatch.start = {
      dateTime: startNaive,
      timeZone: "Asia/Jerusalem",
    };
    fieldPatch.end = { dateTime: endNaive, timeZone: "Asia/Jerusalem" };
  }

  const result = await updateExistingCalendarEvent({
    accessToken: cal.accessToken,
    eventId: String(event_id),
    fieldPatch,
    conferenceType: extras.conferenceType,
    extraEmails: extras.extraEmails as Array<never>,
    extraNamed: extras.extraNamed as Array<never>,
    createZoomMeetingFn:
      extras.conferenceType === "zoom"
        ? await makeZoomMeetingCreator(supabase, tenantId, title)
        : null,
  });
  if ("error" in result && result.error) {
    return result;
  }
  const conferenceUrl = (result as { conference_url?: string | null })
    .conference_url;
  return {
    ...result,
    carmen_attendee: extras.carmen_attendee,
    carmen_meeting_bot: conferenceUrl
      ? {
          tool: "join_meeting_for_client",
          meeting_url: conferenceUrl,
          note: "לצירוף כרמן כבוט תמלול בזמן הפגישה — קראי ל-join_meeting_for_client עם conference_url.",
        }
      : null,
  };
}
