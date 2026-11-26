import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import { withRuntime } from "../_shared/testing/served-handler.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { freshGaToken } from "./ga-token.ts";

const SUPABASE_URL = "https://ga-token-test.supabase.co";

const READ_AT = "2026-11-23T10:00:00.000Z";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
};

Deno.test(
  "a refreshed GA token is saved only while the connection is unchanged since it was read",
  async () => {
    const http = fakeSupabaseHttp({
      supabaseUrl: SUPABASE_URL,
      other: (url) =>
        url.hostname === "oauth2.googleapis.com"
          ? Response.json({ access_token: "fresh", expires_in: 3600 })
          : new Response("unexpected", { status: 404 }),
    });

    const token = await withRuntime({ env, fetch: http.fetch }, () =>
      freshGaToken(serviceClient(), {
        id: "ga-1",
        // The row's api_key is empty once the tokens live in integration_secrets.
        api_key: null,
        settings: { refresh_token: "refresh-1", expires_at: READ_AT },
        updated_at: READ_AT,
      }),
    );

    assertEquals(token, "fresh");
    const save = http.calls.find((call) => call.method === "PATCH");
    assertEquals(save?.url.searchParams.get("id"), "eq.ga-1");
    assertEquals(save?.url.searchParams.get("updated_at"), `eq.${READ_AT}`);
    assertEquals(save?.url.searchParams.has("api_key"), false);
  },
);
