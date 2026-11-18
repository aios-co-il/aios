import { assertEquals } from "jsr:@std/assert@1";
import { buildCalendarAuthorizeUrl } from "./authorize-url.ts";

Deno.test(
  "the consent screen asks for events and the calendar list, not full calendar",
  () => {
    const url = authorizeUrl(false);

    assertEquals(url.searchParams.get("scope")?.split(" "), [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  },
);

Deno.test("consent is forced only without a stored refresh token", () => {
  assertEquals(authorizeUrl(true).searchParams.get("prompt"), "consent");
  assertEquals(authorizeUrl(false).searchParams.has("prompt"), false);
});

function authorizeUrl(forceConsent: boolean): URL {
  return new URL(
    buildCalendarAuthorizeUrl({
      clientId: "client-1",
      redirectUri:
        "https://example.supabase.co/functions/v1/google-calendar-auth",
      state: "user-1",
      forceConsent,
    }),
  );
}
