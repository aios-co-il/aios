import { resolveCalendarAccessToken } from "./calendar-access-token.ts";
import type { ListCalendarEventsArgs } from "./calendar-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { providerErrorMessage } from "../tool-contracts-admin.ts";
import { readGoogleCalendarEvents } from "../tool-contracts-admin.ts";
import { extractConferenceUrl } from "../../_shared/calendar-conference.ts";
import { conferenceKindFromUrl } from "../../_shared/calendar-conference.ts";

/** Preserves the existing list_calendar_events executor and side-effect order. */
export async function executeListCalendarEvents(
  args: ListCalendarEventsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, callerCampaignerId } = context;

  const cal = await resolveCalendarAccessToken(
    supabase,
    tenantId,
    callerCampaignerId ?? null,
    userId,
  );
  if (cal.error || !cal.accessToken) {
    return { error: cal.error };
  }
  const fromDate = String(
    args.date_from || new Date().toISOString().slice(0, 10),
  );
  const toDate = String(
    args.date_to ||
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
  );
  const qp = new URLSearchParams({
    timeMin: `${fromDate}T00:00:00+03:00`,
    timeMax: `${toDate}T23:59:59+03:00`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "30",
  });
  if (args.search) {
    qp.set("q", String(args.search));
  }
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${qp}`,
    {
      headers: { Authorization: `Bearer ${cal.accessToken}` },
    },
  );
  const data: unknown = await resp.json();
  if (!resp.ok) {
    return {
      error: `שגיאת Google Calendar: ${providerErrorMessage(data) || resp.status}`,
    };
  }
  const calendarItems = readGoogleCalendarEvents(data);
  return {
    count: calendarItems.length,
    events: calendarItems.map((e) => ({
      event_id: e.id,
      title: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
      attendees: (e.attendees || []).map((a) => a.email),
      link: e.htmlLink,
      conference_url: extractConferenceUrl(e),
      conference_type: conferenceKindFromUrl(extractConferenceUrl(e)),
    })),
  };
}
