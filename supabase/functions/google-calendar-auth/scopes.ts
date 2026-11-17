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
