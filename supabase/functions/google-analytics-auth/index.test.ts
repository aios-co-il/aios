import { assertEquals } from "jsr:@std/assert@1";
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

const MEMBER = "11111111-1111-4111-8111-111111111111";

const OUTSIDER = "33333333-3333-4333-8333-333333333333";

const TENANT = "22222222-2222-4222-8222-222222222222";

/** The handlers sign with this key, derived from GOOGLE_CLIENT_SECRET below. */
const STATE_SECRET = oauthStateKey("test-secret");

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  APP_URL: "https://aios.co.il",
};

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-analytics-auth`;

/** Supabase with one tenant, its member and an outsider, and Google's token and userinfo endpoints. */
function fakeHttp(integrations: Array<Record<string, unknown>>) {
  return fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER, outsider: OUTSIDER },
    tables: {
      tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }],
      tenants: [{ id: TENANT, slug: "acme" }],
      tenant_integrations: integrations,
    },
    rpc: { is_super_admin: () => false },
    other: (url) => {
      if (url.href === "https://oauth2.googleapis.com/token") {
        return Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        });
      }
      if (url.href === "https://www.googleapis.com/oauth2/v2/userinfo") {
        return Response.json({ email: "owner@example.com" });
      }
      throw new Error(`Unexpected provider request: ${url.href}`);
    },
  });
}

function authorize(token: string | null, body: Record<string, unknown>) {
  return new Request(`${FUNCTION_URL}?action=authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Runs the real handler against the fake Supabase. */
async function run(
  request: Request,
  integrations: Array<Record<string, unknown>> = [],
) {
  const http = fakeHttp(integrations);

  return await withRuntime({ env, fetch: http.fetch }, async () => {
    const handle = await servedHandler(new URL("./index.ts", import.meta.url));
    return { response: await handle(request), http };
  });
}

Deno.test({
  name: "google-analytics-auth connect flow",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step("authorize without a valid session is 401", async () => {
      for (const token of [null, "not-a-session"]) {
        const { response } = await run(authorize(token, { tenantId: TENANT }));
        assertEquals(response.status, 401);
      }
    });

    await t.step(
      "authorize for a tenant the caller is not in is 403",
      async () => {
        const { response } = await run(
          authorize("outsider", { tenantId: TENANT, userId: MEMBER }),
        );
        assertEquals(response.status, 403);
      },
    );

    await t.step(
      "authorize signs the session user, not a userId from the body",
      async () => {
        const { response } = await run(
          authorize("member", {
            tenantId: TENANT,
            userId: OUTSIDER,
            origin: "https://evil.example",
          }),
        );
        assertEquals(response.status, 200);
        const { authUrl } = await response.json();
        const state = await verifyOAuthState(
          new URL(authUrl).searchParams.get("state"),
          STATE_SECRET,
        );
        assertEquals(state?.userId, MEMBER);
        assertEquals(state?.tenantId, TENANT);
        assertEquals(state?.origin, null);
      },
    );

    await t.step(
      "a forged state is refused before the code is exchanged",
      async () => {
        const forged = btoa(
          JSON.stringify({ tenantId: TENANT, userId: OUTSIDER, origin: null }),
        );
        const { response, http } = await run(
          new Request(
            `${FUNCTION_URL}?action=oauth_callback&code=code&state=${encodeURIComponent(forged)}`,
          ),
        );
        assertEquals(response.status, 302);
        assertEquals(
          response.headers.get("Location"),
          "https://aios.co.il/t/app/integrations?error=invalid_state",
        );
        assertEquals(http.calls.length, 0);
      },
    );

    await t.step(
      "the error redirect stays on the app and encodes the error",
      async () => {
        const forged = btoa(
          JSON.stringify({ tenantId: TENANT, origin: "https://evil.example" }),
        );
        const { response } = await run(
          new Request(
            `${FUNCTION_URL}?action=oauth_callback&error=${encodeURIComponent("x&y=1")}&state=${encodeURIComponent(forged)}`,
          ),
        );
        assertEquals(
          response.headers.get("Location"),
          "https://aios.co.il/t/app/integrations?error=invalid_state",
        );

        const signed = await signOAuthState(
          {
            userId: MEMBER,
            tenantId: TENANT,
            origin: "https://evil.example",
            addNew: false,
          },
          STATE_SECRET,
        );
        const { response: denied } = await run(
          new Request(
            `${FUNCTION_URL}?action=oauth_callback&error=${encodeURIComponent("x&y=1")}&state=${encodeURIComponent(signed)}`,
          ),
        );
        assertEquals(
          denied.headers.get("Location"),
          "https://aios.co.il/t/acme/integrations?error=x%26y%3D1",
        );
      },
    );

    await t.step(
      "the callback hands the code to the app in the URL fragment",
      async () => {
        const state = await memberState();
        const { response, http } = await run(
          new Request(
            `${FUNCTION_URL}?action=oauth_callback&code=the-code&state=${encodeURIComponent(state)}`,
          ),
        );
        const location = new URL(response.headers.get("Location") ?? "");
        assertEquals(
          location.origin + location.pathname,
          "https://staging.aios.co.il/t/acme/integrations",
        );
        assertEquals(location.search, "");
        const fragment = new URLSearchParams(location.hash.slice(1));
        assertEquals(fragment.get("google_connect"), "google-analytics-auth");
        assertEquals(fragment.get("code"), "the-code");
        assertEquals(fragment.get("state"), state);
        assertEquals(
          http.calls.some((call) =>
            call.url.hostname.endsWith("googleapis.com"),
          ),
          false,
        );
      },
    );

    await t.step("complete by another user is 403", async () => {
      const { response, http } = await run(
        completeRequest("outsider", await memberState()),
      );
      assertEquals(response.status, 403);
      assertEquals(
        http.calls.some((call) => call.url.pathname.startsWith("/rest/")),
        false,
      );
    });

    await t.step(
      "complete by the member saves the org connection",
      async () => {
        const { response, http } = await run(
          completeRequest("member", await memberState()),
        );
        assertEquals(response.status, 200);
        const inserts = http.calls.filter(
          (call) =>
            call.method === "POST" &&
            call.url.pathname === "/rest/v1/tenant_integrations",
        );
        assertEquals(inserts.length, 1);
        const row = inserts[0].body;
        assertEquals(row && Reflect.get(row, "tenant_id"), TENANT);
        assertEquals(row && Reflect.get(row, "user_id"), MEMBER);
        assertEquals(row && Reflect.get(row, "connection_visibility"), "org");
        const settings = row && Reflect.get(row, "settings");
        assertEquals(
          settings && Reflect.get(settings, "refresh_token"),
          "new-refresh",
        );
        assertEquals(
          settings && Reflect.get(settings, "google_email"),
          "owner@example.com",
        );
      },
    );

    await t.step(
      "a reconnect updates only the row version it read, and fails rather than overwrite a change",
      async () => {
        const readAt = "2026-11-19T10:00:00.000Z";
        const { response, http } = await run(
          completeRequest("member", await memberState()),
          [
            {
              id: "44444444-4444-4444-8444-444444444444",
              tenant_id: TENANT,
              integration_type: "google_analytics",
              user_id: MEMBER,
              settings: {
                google_email: "owner@example.com",
                property_id: "p1",
              },
              updated_at: readAt,
            },
          ],
        );
        const update = http.calls.find((call) => call.method === "PATCH");
        assertEquals(
          update?.url.searchParams.get("updated_at"),
          `eq.${readAt}`,
        );
        assertEquals(
          update?.body &&
            Reflect.get(Reflect.get(update.body, "settings"), "property_id"),
          "p1",
        );
        // The fake answers every update with no rows, as a concurrent change would.
        assertEquals(response.status, 500);
      },
    );
  },
});

/** A state the member signed for the tenant, started on Staging. */
async function memberState() {
  return await signOAuthState(
    {
      userId: MEMBER,
      tenantId: TENANT,
      origin: "https://staging.aios.co.il",
      addNew: false,
    },
    STATE_SECRET,
  );
}

/** The app's `complete` call, signed in with the given session. */
function completeRequest(token: string, state: string) {
  return new Request(`${FUNCTION_URL}?action=complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "complete", code: "the-code", state }),
  });
}
