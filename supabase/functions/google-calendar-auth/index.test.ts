import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://oauth-test.supabase.co";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

Deno.test({
  name: "google-calendar-auth handler permissions",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "init returns the narrow scopes from the real handler",
      async () => {
        const http = fakeSupabaseHttp({
          supabaseUrl: SUPABASE_URL,
          users: { session: "user-1" },
        });
        await withRuntime({ env, fetch: http.fetch }, async () => {
          const handle = await servedHandler(
            new URL("./index.ts", import.meta.url),
          );
          const response = await handle(
            new Request(SUPABASE_URL, {
              method: "POST",
              headers: {
                Authorization: "Bearer session",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ action: "init", tenantId: "tenant-1" }),
            }),
          );
          assertEquals(response.status, 200);
          const { authUrl } = await response.json();
          const url = new URL(authUrl);
          assertEquals(url.searchParams.get("scope")?.split(" "), [
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
          ]);
          assertEquals(url.searchParams.get("client_id"), env.GOOGLE_CLIENT_ID);
          assertEquals(url.searchParams.get("state"), "user-1");
        });
      },
    );

    for (const [scope, accepted] of [
      [undefined, false],
      ["", false],
      ["https://www.googleapis.com/auth/calendar.events", false],
      ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", false],
      ["https://www.googleapis.com/auth/calendar.readonly", false],
      [
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        true,
      ],
      ["https://www.googleapis.com/auth/calendar", true],
    ] as const) {
      await t.step(
        `callback scope ${String(scope)} is ${accepted ? "accepted" : "rejected"}`,
        async () => {
          const existing = {
            user_id: "user-1",
            access_token: "existing",
            refresh_token: "existing-refresh",
          };
          const http = fakeSupabaseHttp({
            supabaseUrl: SUPABASE_URL,
            tables: { calendar_tokens: [existing] },
            other: (url) => {
              if (url.href === "https://oauth2.googleapis.com/token") {
                return Response.json({
                  access_token: "new-access",
                  refresh_token: "new-refresh",
                  expires_in: 3600,
                  scope,
                });
              }
              if (
                url.href === "https://www.googleapis.com/oauth2/v2/userinfo"
              ) {
                return Response.json({ email: "mailbox@example.com" });
              }
              throw new Error(`Unexpected provider request: ${url.href}`);
            },
          });
          await withRuntime({ env, fetch: http.fetch }, async () => {
            const handle = await servedHandler(
              new URL("./index.ts", import.meta.url),
            );
            const response = await handle(
              new Request(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback&code=code&state=user-1`,
              ),
            );
            const writes = http.calls.filter(
              (call) =>
                call.method === "POST" &&
                call.url.pathname === "/rest/v1/calendar_tokens",
            );
            assertEquals(writes.length, accepted ? 1 : 0);
            if (accepted) {
              assertEquals(response.status, 200);
              assertStringIncludes(await response.text(), "calendar_connected");
              assertEquals(
                writes[0].body && Reflect.get(writes[0].body, "google_email"),
                "mailbox@example.com",
              );
            } else {
              assertEquals(response.status, 500);
              const { error } = await response.json();
              assertStringIncludes(error, "permission is missing");
              assertStringIncludes(error, "again");
              assertEquals(
                http.calls.some(
                  (call) =>
                    call.url.pathname === "/functions/v1/google-calendar-watch",
                ),
                false,
              );
              assertEquals(
                http.calls.filter((call) =>
                  call.url.pathname.startsWith("/rest/"),
                ).length,
                0,
              );
              assertEquals(existing.access_token, "existing");
            }
          });
        },
      );
    }
  },
});
