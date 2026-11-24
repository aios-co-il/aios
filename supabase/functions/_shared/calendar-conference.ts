export {
  applyZoomLinkToEvent,
  buildMeetConferenceData,
  collectExtraAttendeeEmails,
  conferenceKindFromUrl,
  createZoomMeeting,
  eventDurationMinutes,
  extractConferenceUrl,
  fetchZoomAccessToken,
  googleCalendarGetEvent,
  googleCalendarPatchEvent,
  googleEventPatchUrl,
  mergeNamedPrimaryAttendee,
  resolveCarmenAttendeeEmail,
  resolveRequestedConference,
  summarizeEventResult,
  updateExistingCalendarEvent,
  zoomUnavailableMessage,
} from "./calendar-conference.mjs";

/** Preserve Google's attendee notifications for create and cancel requests (AIO-248). */
export function calendarNotificationParams(notify = false): URLSearchParams {
  const params = new URLSearchParams({ sendUpdates: "all" });
  if (notify) {
    params.set("sendNotifications", "true");
  }
  return params;
}
