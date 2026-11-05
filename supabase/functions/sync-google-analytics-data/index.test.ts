import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";

/** A GA table on connection int-1, whose access token is due for refresh. */
const tables = {
  crm_tables: [
    {
      id: "ga-1",
      tenant_id: "tenant-1",
      integration_type: "google_analytics",
      integration_settings: { integrationId: "int-1", propertyId: "123" },
    },
  ],
  tenant_integrations: [
    {
      id: "int-1",
      tenant_id: "tenant-1",
      api_key: "expired-token",
      settings: {
        refresh_token: "refresh",
        expires_at: "2026-01-01T00:00:00Z",
      },
    },
  ],
};

/** One sync of ga-1 where Google's token endpoint answers `refused`. */
async function syncWithRefusal(refused: Response) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables,
    other: (url) =>
      url.hostname === "oauth2.googleapis.com"
        ? refused
        : Response.json({ error: "unexpected" }, { status: 404 }),
  });
  const res = await withRuntime(
    {
      env: {
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
      },
      fetch: http.fetch,
    },
    async () => {
      const handle = await servedHandler(
        new URL("./index.ts", import.meta.url),
      );
      return await handle(
        new Request(SUPABASE_URL, {
          method: "POST",
          body: JSON.stringify({ tableId: "ga-1" }),
        }),
      );
    },
  );
  const reauthWrites = http.calls.filter(
    (call) =>
      call.method === "PATCH" &&
      call.url.pathname === "/rest/v1/tenant_integrations",
  );
  return { status: res.status, body: await res.json(), reauthWrites };
}

Deno.test({
  name: "sync-google-analytics-data token refresh",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "a revoked refresh token flags the connection needs_reauth",
      async () => {
        const { status, body, reauthWrites } = await syncWithRefusal(
          Response.json(
            { error: "invalid_grant", error_description: "Token revoked" },
            { status: 400 },
          ),
        );
        assertStrictEquals(status, 500);
        assertStringIncludes(body.error, "GOOGLE_AUTH_REVOKED");
        assertStrictEquals(reauthWrites.length, 1);
        assertEquals(
          (reauthWrites[0].body as { settings: Record<string, unknown> })
            .settings.needs_reauth,
          true,
        );
      },
    );

    await t.step(
      "a Google outage or throttle fails the run and leaves the connection alone",
      async () => {
        for (const refused of [
          new Response("Service Unavailable", { status: 503 }),
          Response.json({ error: "rate_limit_exceeded" }, { status: 429 }),
        ]) {
          const { status, body, reauthWrites } = await syncWithRefusal(refused);
          assertStrictEquals(status, 500);
          assertStringIncludes(body.error, "GOOGLE_TOKEN_REFRESH_FAILED");
          assertStrictEquals(reauthWrites.length, 0);
        }
      },
    );
  },
});
