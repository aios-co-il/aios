import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { verifyOAuthState } from "../_shared/google-oauth/oauth-state.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://oauth-test.supabase.co";

const MEMBER = "11111111-1111-4111-8111-111111111111";

const OUTSIDER = "33333333-3333-4333-8333-333333333333";

const TENANT = "22222222-2222-4222-8222-222222222222";

const STATE_SECRET = "test-state-secret";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  OAUTH_STATE_SECRET: STATE_SECRET,
};

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gmail-auth`;

/** Runs the real handler against a tenant with one member; Google is never called. */
async function run(request: Request) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER, outsider: OUTSIDER },
    tables: {
      tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }],
      gmail_tokens: [],
    },
    rpc: { is_super_admin: () => false },
    other: (url) => {
      throw new Error(`Unexpected provider request: ${url.href}`);
    },
  });

  return await withRuntime({ env, fetch: http.fetch }, async () => {
    const handle = await servedHandler(new URL("./index.ts", import.meta.url));
    return { response: await handle(request), http };
  });
}

function init(token: string) {
  return new Request(FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://staging.aios.co.il",
    },
    body: JSON.stringify({ action: "init", tenantId: TENANT }),
  });
}

Deno.test({
  name: "gmail-auth connect flow",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step("init for a tenant the caller is not in is 403", async () => {
      const { response } = await run(init("outsider"));
      assertEquals(response.status, 403);
    });

    await t.step(
      "init signs the caller, the tenant and the app origin",
      async () => {
        const { response } = await run(init("member"));
        assertEquals(response.status, 200);
        const { authUrl } = await response.json();
        const state = await verifyOAuthState(
          new URL(authUrl).searchParams.get("state"),
          STATE_SECRET,
        );
        assertEquals(state?.userId, MEMBER);
        assertEquals(state?.tenantId, TENANT);
        assertEquals(state?.origin, "https://staging.aios.co.il");
      },
    );

    await t.step(
      "the old userId|tenantId state is refused before the code is exchanged",
      async () => {
        const { response, http } = await run(
          new Request(
            `${FUNCTION_URL}?code=code&state=${encodeURIComponent(`${OUTSIDER}|${TENANT}`)}`,
          ),
        );
        assertEquals(response.status, 500);
        const { error } = await response.json();
        assertStringIncludes(error, "invalid or has expired");
        assertEquals(http.calls.length, 0);
      },
    );
  },
});
