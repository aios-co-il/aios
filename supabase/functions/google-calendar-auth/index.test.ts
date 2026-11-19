import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  oauthStateKey,
  signOAuthState,
  verifyOAuthState,
} from "../_shared/google-oauth/oauth-state.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://oauth-test.supabase.co";

const USER_ID = "11111111-1111-4111-8111-111111111111";

/** The handlers sign with this key, derived from GOOGLE_CLIENT_SECRET below. */
const STATE_SECRET = oauthStateKey("test-secret");

const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";

/** The app's `complete` call, signed in as the `session` user. */
function complete(state: string) {
  return new Request(SUPABASE_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer session",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "complete", code: "code", state }),
  });
}

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
          users: { session: USER_ID },
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
          const state = await verifyOAuthState(
            url.searchParams.get("state"),
            STATE_SECRET,
          );
          assertEquals(state?.userId, USER_ID);
          assertEquals(state?.origin, null);
        });
      },
    );

    for (const forged of [USER_ID, btoa(JSON.stringify({ userId: USER_ID }))]) {
      await t.step(
        `callback refuses an unsigned state before exchanging the code: ${forged.slice(0, 8)}`,
        async () => {
          const http = fakeSupabaseHttp({
            supabaseUrl: SUPABASE_URL,
            tables: { calendar_tokens: [] },
            other: (url) => {
              throw new Error(`Unexpected provider request: ${url.href}`);
            },
          });
          await withRuntime({ env, fetch: http.fetch }, async () => {
            const handle = await servedHandler(
              new URL("./index.ts", import.meta.url),
            );
            const response = await handle(
              new Request(
                `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback&code=code&state=${encodeURIComponent(forged)}`,
              ),
            );
            assertEquals(response.status, 500);
            const { error } = await response.json();
            assertStringIncludes(error, "invalid or has expired");
            assertEquals(http.calls.length, 0);
          });
        },
      );
    }

    await t.step(
      "callback hands the code to the app without exchanging it",
      async () => {
        const http = fakeSupabaseHttp({
          supabaseUrl: SUPABASE_URL,
          other: (url) => {
            throw new Error(`Unexpected provider request: ${url.href}`);
          },
        });
        await withRuntime({ env, fetch: http.fetch }, async () => {
          const handle = await servedHandler(
            new URL("./index.ts", import.meta.url),
          );
          const state = await signOAuthState(
            {
              userId: USER_ID,
              tenantId: null,
              origin: "https://aios.co.il",
              addNew: false,
            },
            STATE_SECRET,
          );
          const response = await handle(
            new Request(
              `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=callback&code=the-code&state=${encodeURIComponent(state)}`,
            ),
          );
          const page = await response.text();
          assertStringIncludes(page, '"type":"google_connect_code"');
          assertStringIncludes(page, '"provider":"google-calendar-auth"');
          assertStringIncludes(page, '"code":"the-code"');
          assertStringIncludes(page, `"state":${JSON.stringify(state)}`);
          assertStringIncludes(page, '"https://aios.co.il")');
          assertEquals(http.calls.length, 0);
        });
      },
    );

    await t.step(
      "complete refuses a connect another user started",
      async () => {
        const http = fakeSupabaseHttp({
          supabaseUrl: SUPABASE_URL,
          users: { session: USER_ID },
          other: (url) => {
            throw new Error(`Unexpected provider request: ${url.href}`);
          },
        });
        await withRuntime({ env, fetch: http.fetch }, async () => {
          const handle = await servedHandler(
            new URL("./index.ts", import.meta.url),
          );
          const response = await handle(
            complete(
              await signOAuthState(
                {
                  userId: OTHER_USER_ID,
                  tenantId: null,
                  origin: null,
                  addNew: false,
                },
                STATE_SECRET,
              ),
            ),
          );
          assertEquals(response.status, 403);
          assertEquals(
            http.calls.some((call) => call.url.pathname.startsWith("/rest/")),
            false,
          );
        });
      },
    );

    for (const [storedEmail, reused] of [
      ["mailbox@example.com", true],
      ["other@example.com", false],
    ] as const) {
      await t.step(
        `a reconnect without a new refresh token ${reused ? "reuses" : "refuses"} the stored one for ${storedEmail}`,
        async () => {
          const http = fakeSupabaseHttp({
            supabaseUrl: SUPABASE_URL,
            users: { session: USER_ID },
            tables: {
              calendar_tokens: [
                {
                  user_id: USER_ID,
                  refresh_token: "stored-refresh",
                  google_email: storedEmail,
                },
              ],
            },
            other: (url) => {
              if (url.href === "https://oauth2.googleapis.com/token") {
                return Response.json({
                  access_token: "new-access",
                  expires_in: 3600,
                  scope: "https://www.googleapis.com/auth/calendar",
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
            const state = await signOAuthState(
              { userId: USER_ID, tenantId: null, origin: null, addNew: false },
              STATE_SECRET,
            );
            const response = await handle(complete(state));
            const writes = http.calls.filter(
              (call) =>
                call.method === "POST" &&
                call.url.pathname === "/rest/v1/calendar_tokens",
            );
            if (reused) {
              assertEquals(response.status, 200);
              assertEquals(
                writes[0]?.body && Reflect.get(writes[0].body, "refresh_token"),
                "stored-refresh",
              );
            } else {
              assertEquals(response.status, 500);
              const { error } = await response.json();
              assertStringIncludes(error, "different Google account");
              assertEquals(writes.length, 0);
            }
          });
        },
      );
    }

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
        `complete with scope ${String(scope)} is ${accepted ? "accepted" : "rejected"}`,
        async () => {
          const existing = {
            user_id: USER_ID,
            access_token: "existing",
            refresh_token: "existing-refresh",
          };
          const http = fakeSupabaseHttp({
            supabaseUrl: SUPABASE_URL,
            users: { session: USER_ID },
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
            const state = await signOAuthState(
              { userId: USER_ID, tenantId: null, origin: null, addNew: false },
              STATE_SECRET,
            );
            const response = await handle(complete(state));
            const writes = http.calls.filter(
              (call) =>
                call.method === "POST" &&
                call.url.pathname === "/rest/v1/calendar_tokens",
            );
            assertEquals(writes.length, accepted ? 1 : 0);
            if (accepted) {
              assertEquals(response.status, 200);
              assertEquals(await response.json(), { success: true });
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
