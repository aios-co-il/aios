import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
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

const TENANT = "22222222-2222-4222-8222-222222222222";

/** The handlers sign with this key, derived from GOOGLE_CLIENT_SECRET below. */
const STATE_SECRET = oauthStateKey("test-secret");

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  PUBLIC_API_URL: null,
  APP_URL: "https://aios.co.il",
};

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-ads-auth`;

/** Runs the real handler; Google is never called. */
async function run(
  request: Request,
  runtimeEnv: Record<string, string | null> = env,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { session: USER_ID },
    tables: { tenants: [{ id: TENANT, slug: "acme" }] },
    rpc: { get_user_tenant_id: () => TENANT },
    other: (url) => {
      throw new Error(`Unexpected provider request: ${url.href}`);
    },
  });

  return await withRuntime({ env: runtimeEnv, fetch: http.fetch }, async () => {
    const handle = await servedHandler(new URL("./index.ts", import.meta.url));
    return { response: await handle(request), http };
  });
}

Deno.test({
  name: "google-ads-auth connect flow",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "get_auth_url signs the caller and drops a foreign origin",
      async () => {
        const { response } = await run(
          new Request(`${FUNCTION_URL}?action=get_auth_url`, {
            method: "POST",
            headers: {
              Authorization: "Bearer session",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ origin: "https://evil.example" }),
          }),
        );
        assertEquals(response.status, 200);
        const { auth_url } = await response.json();
        const state = await verifyOAuthState(
          new URL(auth_url).searchParams.get("state"),
          STATE_SECRET,
        );
        assertEquals(state?.userId, USER_ID);
        assertEquals(state?.tenantId, TENANT);
        assertEquals(state?.origin, null);
      },
    );

    await t.step(
      "the authorize URL sends Google the custom-domain callback when PUBLIC_API_URL is set",
      async () => {
        const { response } = await run(
          new Request(`${FUNCTION_URL}?action=get_auth_url`, {
            method: "POST",
            headers: {
              Authorization: "Bearer session",
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
          {
            ...env,
            PUBLIC_API_URL: "https://api.aios.co.il",
          },
        );
        const { auth_url } = await response.json();
        assertEquals(
          new URL(auth_url).searchParams.get("redirect_uri"),
          "https://api.aios.co.il/functions/v1/google-ads-auth?action=oauth_callback",
        );
      },
    );

    await t.step(
      "complete does not need a default tenant: the tenant comes from the signed state",
      async () => {
        const state = await signOAuthState(
          { userId: USER_ID, tenantId: TENANT, origin: null, addNew: false },
          STATE_SECRET,
        );
        const http = fakeSupabaseHttp({
          supabaseUrl: SUPABASE_URL,
          users: { session: USER_ID },
          tables: { tenant_users: [] },
          rpc: { get_user_tenant_id: () => null, is_super_admin: () => false },
          other: (url) => {
            throw new Error(`Unexpected provider request: ${url.href}`);
          },
        });
        const response = await withRuntime(
          { env, fetch: http.fetch },
          async () => {
            const handle = await servedHandler(
              new URL("./index.ts", import.meta.url),
            );
            return await handle(
              new Request(`${FUNCTION_URL}?action=complete`, {
                method: "POST",
                headers: {
                  Authorization: "Bearer session",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ action: "complete", code: "c", state }),
              }),
            );
          },
        );
        const { error } = await response.json();
        assertNotEquals(error, "No tenant found");
        assertEquals(
          http.calls.some(({ url }) => url.pathname.endsWith("/tenant_users")),
          true,
        );
      },
    );

    await t.step(
      "a forged state is refused before the code is exchanged",
      async () => {
        const forged = btoa(
          JSON.stringify({ tenantId: TENANT, userId: USER_ID, origin: null }),
        );
        const { response, http } = await run(
          new Request(
            `${FUNCTION_URL}?action=oauth_callback&code=code&state=${encodeURIComponent(forged)}`,
          ),
        );
        assertEquals(
          response.headers.get("Location"),
          "https://aios.co.il/t/app/integrations#google_connect=google-ads-auth&error=invalid_state",
        );
        assertEquals(http.calls.length, 0);
      },
    );
  },
});
