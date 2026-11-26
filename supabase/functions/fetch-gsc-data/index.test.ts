import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://gsc-test.supabase.co";

const MEMBER = "11111111-1111-4111-8111-111111111111";

const CLIENT = "33333333-3333-4333-8333-333333333333";

const CLIENT_TENANT = "44444444-4444-4444-8444-444444444444";

const OTHER_TENANT = "77777777-7777-4777-8777-777777777777";

const OTHER_GSC = "99999999-9999-4999-8999-999999999999";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

/** Runs the real handler for a member of the client's organization; Google is never called. */
async function run(body: Record<string, unknown>) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER },
    tables: {
      clients: [{ id: CLIENT, tenant_id: CLIENT_TENANT, agency_id: null }],
      tenant_integrations: [
        {
          id: OTHER_GSC,
          tenant_id: OTHER_TENANT,
          integration_type: "google_search_console",
          api_key: "other-org-token",
          settings: { refresh_token: "other-org-refresh" },
        },
      ],
    },
    other: (url) => {
      throw new Error(`Unexpected provider request: ${url.href}`);
    },
  });

  return await withRuntime({ env, fetch: http.fetch }, async () => {
    const handle = await servedHandler(new URL("./index.ts", import.meta.url));
    const response = await handle(
      new Request(`${SUPABASE_URL}/functions/v1/fetch-gsc-data`, {
        method: "POST",
        headers: {
          Authorization: "Bearer member",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
    return { response, http };
  });
}

Deno.test({
  name: "fetch-gsc-data client access",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step("a request without the client is refused", async () => {
      const { response } = await run({
        integrationId: OTHER_GSC,
        siteUrl: "sc-domain:other.example",
      });
      assertEquals(response.status, 400);
    });

    await t.step(
      "another organization's connection is not found, and Google is never called",
      async () => {
        const { response, http } = await run({
          clientId: CLIENT,
          integrationId: OTHER_GSC,
          siteUrl: "sc-domain:other.example",
        });
        assertEquals(response.status, 404);
        assertEquals(
          http.calls.some((call) =>
            call.url.hostname.endsWith("googleapis.com"),
          ),
          false,
        );
      },
    );
  },
});
