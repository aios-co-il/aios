import { resolveCalendarConferenceExtras } from "./calendar-conference.ts";
import { resolveCalendarAccessToken } from "./calendar-access-token.ts";
import type { SendCalendarInviteArgs } from "./calendar-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { mergeNamedPrimaryAttendee } from "../../_shared/calendar-conference.ts";
import { fetchZoomAccessToken } from "../../_shared/calendar-conference.ts";
import { createZoomMeeting } from "../../_shared/calendar-conference.ts";
import { applyZoomLinkToEvent } from "../../_shared/calendar-conference.ts";
import { buildMeetConferenceData } from "../../_shared/calendar-conference.ts";
import { summarizeEventResult } from "../../_shared/calendar-conference.ts";
import { extractConferenceUrl } from "../../_shared/calendar-conference.ts";

/** Preserves the existing send_calendar_invite executor and side-effect order. */
export async function executeSendCalendarInvite(
  args: SendCalendarInviteArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, callerCampaignerId } = context;

  const {
    attendee_email,
    attendee_name,
    title,
    date,
    time,
    duration_minutes,
    notes,
  } = args;
  if (!attendee_email || !title || !date || !time) {
    return { error: "attendee_email, title, date, time נדרשים" };
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
  const accessToken = cal.accessToken;
  const extras = await resolveCalendarConferenceExtras(
    supabase,
    tenantId,
    args,
  );

  // Send naive wall-clock times with an explicit timeZone — Google interprets
  // them in Asia/Jerusalem. toISOString() ('Z') marked Israel wall times as
  // UTC, landing every event 3 hours late (08:00 request → 11:00 invite).
  const startNaive = `${date}T${time}:00`;
  const endNaive = new Date(
    Date.parse(`${startNaive}Z`) + (duration_minutes || 60) * 60_000,
  )
    .toISOString()
    .slice(0, 19);
  const attendees = mergeNamedPrimaryAttendee(
    attendee_email,
    attendee_name,
    extras.extraEmails,
    extras.extraNamed,
  );

  const body: Record<string, unknown> = {
    summary: title,
    description: notes || "",
    start: { dateTime: startNaive, timeZone: "Asia/Jerusalem" },
    end: { dateTime: endNaive, timeZone: "Asia/Jerusalem" },
    attendees,
    guestsCanModify: false,
  };
  let zoom_available: boolean | null = null;
  let zoom_status: string | null | undefined = null;
  let conference_applied = "none";
  const qp = new URLSearchParams({
    sendUpdates: "all",
    sendNotifications: "true",
  });
  if (extras.conferenceType === "zoom") {
    const zoomAuth = await fetchZoomAccessToken(supabase, tenantId);
    if (zoomAuth.accessToken) {
      const zoom = await createZoomMeeting({
        accessToken: zoomAuth.accessToken,
        topic: title,
        startDateTime: `${startNaive}+03:00`,
        durationMinutes: duration_minutes || 60,
      });
      if (zoom.join_url) {
        zoom_available = true;
        conference_applied = "zoom";
        Object.assign(
          body,
          applyZoomLinkToEvent({ description: notes || "" }, zoom.join_url),
        );
      } else {
        zoom_available = zoomAuth.configured !== false;
        zoom_status = zoom.error;
        body.conferenceData = buildMeetConferenceData();
        qp.set("conferenceDataVersion", "1");
        conference_applied = "meet";
      }
    } else {
      zoom_available = false;
      zoom_status = zoomAuth.error;
      body.conferenceData = buildMeetConferenceData();
      qp.set("conferenceDataVersion", "1");
      conference_applied = "meet";
    }
  } else if (extras.conferenceType === "meet") {
    body.conferenceData = buildMeetConferenceData();
    qp.set("conferenceDataVersion", "1");
    conference_applied = "meet";
  }

  const calResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${qp}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const evData = await calResp.json();
  if (!calResp.ok) {
    return {
      error: `שגיאת Google Calendar: ${evData?.error?.message || calResp.status}`,
    };
  }
  const summary = summarizeEventResult(evData, {
    attendee_email,
    attendee_name: attendee_name || null,
    start_israel: startNaive,
    duration_minutes: duration_minutes || 60,
    zoom_available,
    zoom_status,
    conference_applied,
    carmen_attendee: extras.carmen_attendee,
    carmen_meeting_bot: extractConferenceUrl(evData)
      ? {
          tool: "join_meeting_for_client",
          meeting_url: extractConferenceUrl(evData),
          note: "לצירוף כרמן כבוט תמלול בזמן הפגישה — קראי ל-join_meeting_for_client עם conference_url.",
        }
      : null,
    message: `זימון נשלח למייל ${attendee_email}${conference_applied !== "none" ? ` — נוסף ${conference_applied === "zoom" ? "Zoom" : "Google Meet"}` : ""}.`,
  });
  return summary;
}
