import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://oauth-test.supabase.co";

const TENANT = "22222222-2222-4222-8222-222222222222";

const OUTSIDER = "33333333-3333-4333-8333-333333333333";

const MEMBER = "11111111-1111-4111-8111-111111111111";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  PUBLIC_API_URL: null,
  APP_URL: "https://aios.co.il",
};

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-search-console-auth`;

/** Runs the real handler; Google is never called. */
async function run(
  request: Request,
  runtimeEnv: Record<string, string | null> = env,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { outsider: OUTSIDER, member: MEMBER },
    tables: {
      tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }],
      tenants: [{ id: TENANT, slug: "acme" }],
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

function authorize(token: string) {
  return new Request(`${FUNCTION_URL}?action=authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenantId: TENANT, userId: OUTSIDER }),
  });
}

Deno.test({
  name: "google-search-console-auth connect flow",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step("authorize with a made-up token is 401", async () => {
      const { response } = await run(authorize("not-a-session"));
      assertEquals(response.status, 401);
    });

    await t.step("authorize for another tenant is 403", async () => {
      const { response } = await run(authorize("outsider"));
      assertEquals(response.status, 403);
    });

    await t.step(
      "the authorize URL sends Google the custom-domain callback when PUBLIC_API_URL is set",
      async () => {
        const { response } = await run(authorize("member"), {
          ...env,
          PUBLIC_API_URL: "https://api.aios.co.il",
        });
        const { authUrl } = await response.json();
        assertEquals(
          new URL(authUrl).searchParams.get("redirect_uri"),
          "https://api.aios.co.il/functions/v1/google-search-console-auth?action=oauth_callback",
        );
      },
    );

    await t.step(
      "a forged state is refused before the code is exchanged",
      async () => {
        const forged = btoa(
          JSON.stringify({
            tenantId: TENANT,
            userId: OUTSIDER,
            origin: "https://evil.example",
          }),
        );
        const { response, http } = await run(
          new Request(
            `${FUNCTION_URL}?action=oauth_callback&code=code&state=${encodeURIComponent(forged)}`,
          ),
        );
        assertEquals(
          response.headers.get("Location"),
          "https://aios.co.il/t/app/integrations?error=invalid_state",
        );
        assertEquals(http.calls.length, 0);
      },
    );
  },
});
