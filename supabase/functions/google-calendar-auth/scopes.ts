import { missingGrantedScopes } from "../_shared/google-oauth/granted-scopes.ts";

/**
 * Google scopes requested when connecting Calendar.
 * calendar.events covers event list/get/insert/patch/delete and events.watch on
 * any calendar the user can access; calendar.calendarlist.readonly covers
 * users/me/calendarList. No code creates calendars or changes sharing.
 * userinfo.email lets the callback store which Google account was connected.
 */
export const CALENDAR_SCOPES: ReadonlyArray<string> = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/** Without these the connection cannot list calendars or sync events. */
const CALENDAR_REQUIRED_SCOPES: ReadonlyArray<string> = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

/** Full calendar access granted before the scopes were narrowed. */
const LEGACY_FULL_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** Required Calendar scopes missing from Google's token response. */
export function missingCalendarScopes(tokenResponse: unknown): string[] {
  if (
    missingGrantedScopes(tokenResponse, [LEGACY_FULL_CALENDAR_SCOPE]).length ===
    0
  ) {
    return [];
  }

  return missingGrantedScopes(tokenResponse, CALENDAR_REQUIRED_SCOPES);
}
