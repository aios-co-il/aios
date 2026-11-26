import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../database.types.ts";
import { fakeSupabaseHttp } from "../testing/fake-supabase-http.ts";
import {
  type TokenRow,
  withGoogleToken,
  withGoogleTokens,
} from "./integration-tokens.ts";

const SUPABASE_URL = "http://supabase.test";

const SECRET = {
  integration_id: "ga-1",
  tenant_id: "t-1",
  access_token: "secret-access",
  refresh_token: "secret-refresh",
};

Deno.test(
  "takes the tokens from integration_secrets over the row's",
  async () => {
    const { sb } = secretsClient([SECRET]);

    const [row] = await withGoogleTokens(sb, [
      {
        id: "ga-1",
        api_key: "row-access",
        settings: { refresh_token: "row-refresh", property_id: "p1" },
      },
    ]);

    assertEquals(row, {
      id: "ga-1",
      api_key: "secret-access",
      settings: { refresh_token: "secret-refresh", property_id: "p1" },
    });
  },
);

Deno.test("keeps the row's tokens when there is no secret", async () => {
  const { sb } = secretsClient([SECRET]);
  const row = {
    id: "ga-2",
    api_key: "row-access",
    settings: { refresh_token: "row-refresh" },
  };

  assertEquals(await withGoogleTokens(sb, [row]), [row]);
});

Deno.test("keeps a row token the secret lacks", async () => {
  const { sb } = secretsClient([{ ...SECRET, access_token: null }]);
  const stored: TokenRow = {
    id: "ga-1",
    api_key: "row-access",
    settings: null,
  };

  const row = await withGoogleToken(sb, stored);

  assertEquals(row, {
    id: "ga-1",
    api_key: "row-access",
    settings: { refresh_token: "secret-refresh" },
  });
});

Deno.test("reads the secrets of the given rows in one query", async () => {
  const { sb, calls } = secretsClient([SECRET]);

  await withGoogleTokens(sb, [{ id: "ga-1" }, { id: "ga-2" }]);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url.pathname, "/rest/v1/integration_secrets");
  assertEquals(
    calls[0].url.searchParams.get("integration_id"),
    "in.(ga-1,ga-2)",
  );
});

Deno.test("does not change the rows it is given", async () => {
  const { sb } = secretsClient([SECRET]);
  const settings = { refresh_token: "row-refresh" };
  const row = { id: "ga-1", api_key: "row-access", settings };

  await withGoogleTokens(sb, [row]);

  assertEquals(row, {
    id: "ga-1",
    api_key: "row-access",
    settings: { refresh_token: "row-refresh" },
  });
  assertEquals(settings, { refresh_token: "row-refresh" });
});

Deno.test("returns null for no row without a query", async () => {
  const { sb, calls } = secretsClient([SECRET]);

  assertEquals(await withGoogleToken(sb, null), null);
  assertEquals(calls, []);
});

Deno.test("throws when integration_secrets cannot be read", async () => {
  const { sb } = secretsClient([], "boom");

  await assertRejects(
    () => withGoogleTokens(sb, [{ id: "ga-1" }]),
    Error,
    "boom",
  );
});

/** A typed client whose integration_secrets table holds `secrets`. */
function secretsClient(
  secrets: Array<Database["public"]["Tables"]["integration_secrets"]["Insert"]>,
  failure?: string,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: { integration_secrets: secrets },
    failing: failure ? { integration_secrets: failure } : {},
  });
  const sb = createClient<Database>(SUPABASE_URL, "service-key", {
    global: { fetch: http.fetch },
    auth: { persistSession: false },
  });

  return { sb, calls: http.calls };
}
