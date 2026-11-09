import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { CalendarEventLike } from "../../_shared/calendar-recording-match.ts";
import { fetchZoomAccessToken } from "../../_shared/calendar-conference.ts";
import { createZoomMeeting } from "../../_shared/calendar-conference.ts";
import { eventDurationMinutes } from "../../_shared/calendar-conference.ts";

/** Preserves the existing makeZoomMeetingCreator behavior at its extracted boundary. */
export async function makeZoomMeetingCreator(
  supabase: AgentDatabaseClient,
  tenantId: string,
  titleHint?: string,
) {
  return async (existing: CalendarEventLike) => {
    const zoomAuth = await fetchZoomAccessToken(supabase, tenantId);
    if (!zoomAuth.accessToken) {
      return {
        error: zoomAuth.error,
        configured: zoomAuth.configured === true,
      };
    }
    return createZoomMeeting({
      accessToken: zoomAuth.accessToken,
      topic: titleHint || existing?.summary || "Meeting",
      startDateTime: existing?.start?.dateTime || new Date().toISOString(),
      durationMinutes: eventDurationMinutes(existing),
    });
  };
}
