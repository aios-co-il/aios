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
  GMAIL_GOOGLE_CLIENT_ID: null,
  GMAIL_GOOGLE_CLIENT_SECRET: null,
  PUBLIC_API_URL: null,
};

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gmail-auth`;

/** Runs the real handler against a tenant with one member; Google is never called. */
async function run(
  request: Request,
  runtimeEnv: Record<string, string | null> = env,
) {
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

  return await withRuntime({ env: runtimeEnv, fetch: http.fetch }, async () => {
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
      "the authorize URL sends Google the custom-domain callback when PUBLIC_API_URL is set",
      async () => {
        const { response } = await run(init("member"), {
          ...env,
          PUBLIC_API_URL: "https://api.aios.co.il",
        });
        const { authUrl } = await response.json();
        assertEquals(
          new URL(authUrl).searchParams.get("redirect_uri"),
          "https://api.aios.co.il/functions/v1/gmail-auth",
        );
      },
    );

    await t.step(
      "the authorize URL names Gmail's own Google client when it is set",
      async () => {
        const { response } = await run(init("member"), {
          ...env,
          GMAIL_GOOGLE_CLIENT_ID: "gmail-client",
          GMAIL_GOOGLE_CLIENT_SECRET: "gmail-secret",
        });
        const { authUrl } = await response.json();
        assertEquals(
          new URL(authUrl).searchParams.get("client_id"),
          "gmail-client",
        );
      },
    );

    await t.step(
      "the authorize URL names the common Google client without Gmail's own",
      async () => {
        const { response } = await run(init("member"));
        const { authUrl } = await response.json();
        assertEquals(
          new URL(authUrl).searchParams.get("client_id"),
          "test-client",
        );
      },
    );

    await t.step(
      "the old userId|tenantId state is refused before the code is exchanged, and the app is told",
      async () => {
        const { response, http } = await run(
          new Request(
            `${FUNCTION_URL}?code=code&state=${encodeURIComponent(`${OUTSIDER}|${TENANT}`)}`,
          ),
        );
        assertEquals(response.status, 200);
        const page = await response.text();
        assertStringIncludes(page, "google_connect_error");
        assertStringIncludes(page, '"error":"invalid_state"');
        assertEquals(http.calls.length, 0);
      },
    );

    await t.step(
      "a mailbox cannot be completed into another user's account",
      async () => {
        const attackerState = await signOAuthState(
          { userId: MEMBER, tenantId: TENANT, origin: null, addNew: false },
          STATE_SECRET,
        );
        const { response, http } = await run(
          new Request(FUNCTION_URL, {
            method: "POST",
            headers: {
              Authorization: "Bearer outsider",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "complete",
              code: "victim-code",
              state: attackerState,
            }),
          }),
        );
        assertEquals(response.status, 403);
        assertEquals(
          http.calls.some((call) => call.url.pathname.startsWith("/rest/")),
          false,
        );
      },
    );
  },
});
