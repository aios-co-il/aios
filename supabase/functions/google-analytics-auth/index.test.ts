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

/** Supabase with one tenant, its member and an outsider; Google is never called. */
function fakeHttp() {
  return fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER, outsider: OUTSIDER },
    tables: {
      tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }],
      tenants: [{ id: TENANT, slug: "acme" }],
      tenant_integrations: [],
    },
    rpc: { is_super_admin: () => false },
    other: (url) => {
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
async function run(request: Request) {
  const http = fakeHttp();

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
  },
});
