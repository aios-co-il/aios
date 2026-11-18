import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";
import { CALENDAR_SCOPES } from "./scopes.ts";

Deno.test(
  "calendar requests events and calendar list instead of full calendar",
  () => {
    assertEquals(CALENDAR_SCOPES, [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  },
);

Deno.test({
  name: "calendar init handler returns an authorization URL with limited scopes",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const supabaseUrl = "https://calendar-test.supabase.co";
    const http = fakeSupabaseHttp({
      supabaseUrl,
      users: { "test-token": "user-1" },
      tables: { calendar_tokens: [] },
    });
    await withRuntime(
      {
        env: {
          SUPABASE_URL: supabaseUrl,
          SUPABASE_ANON_KEY: "test-anon-key",
          GOOGLE_CLIENT_ID: "test-client-id",
        },
        fetch: http.fetch,
      },
      async () => {
        const handler = await servedHandler(
          new URL("./index.ts", import.meta.url),
        );
        const response = await handler(
          new Request(`${supabaseUrl}/functions/v1/google-calendar-auth`, {
            method: "POST",
            headers: {
              Authorization: "Bearer test-token",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "init" }),
          }),
        );
        assertEquals(response.status, 200);
        const { authUrl } = await response.json();
        const url = new URL(authUrl);
        assertEquals(
          url.origin + url.pathname,
          "https://accounts.google.com/o/oauth2/v2/auth",
        );
        assertEquals(url.searchParams.get("scope")?.split(" "), [
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
        ]);
      },
    );
  },
});
