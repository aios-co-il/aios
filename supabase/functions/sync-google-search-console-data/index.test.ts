import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://gsc-sync-test.supabase.co";

const MEMBER = "11111111-1111-4111-8111-111111111111";

const OUTSIDER = "22222222-2222-4222-8222-222222222222";

const OWN_TENANT = "33333333-3333-4333-8333-333333333333";

const SECOND_TENANT = "44444444-4444-4444-8444-444444444444";

const OTHER_TENANT = "55555555-5555-4555-8555-555555555555";

const OWN_GSC = "66666666-6666-4666-8666-666666666666";

const SECOND_GSC = "77777777-7777-4777-8777-777777777777";

const OTHER_GSC = "88888888-8888-4888-8888-888888888888";

const OWN_TABLE = "99999999-9999-4999-8999-999999999999";

const SECOND_GSC_TABLE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const OTHER_GSC_TABLE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const MISSING_TABLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const DENIED = {
  status: 403,
  body: { error: "Table or integration not found or access denied" },
};

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
};

function gscTable(id: string, integrationId: string) {
  return {
    id,
    tenant_id: OWN_TENANT,
    agency_id: null,
    integration_settings: {
      integration_id: integrationId,
      site_url: "sc-domain:qa.invalid",
    },
  };
}

function gscConnection(id: string, tenantId: string) {
  return {
    id,
    tenant_id: tenantId,
    integration_type: "google_search_console",
    api_key: "access-1",
    settings: {},
  };
}

/**
 * Syncs the table as the bearer. The member belongs to OWN_TENANT and
 * SECOND_TENANT, the outsider to none; every table is OWN_TENANT's.
 * `googleCalls` counts the requests that left for Google.
 */
async function sync(
  bearer: string | null,
  tableId: string,
  superAdmin = false,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER, outsider: OUTSIDER },
    tables: {
      tenant_users: [
        { tenant_id: OWN_TENANT, user_id: MEMBER },
        { tenant_id: SECOND_TENANT, user_id: MEMBER },
      ],
      crm_tables: [
        gscTable(OWN_TABLE, OWN_GSC),
        gscTable(SECOND_GSC_TABLE, SECOND_GSC),
        gscTable(OTHER_GSC_TABLE, OTHER_GSC),
      ],
      tenant_integrations: [
        gscConnection(OWN_GSC, OWN_TENANT),
        gscConnection(SECOND_GSC, SECOND_TENANT),
        gscConnection(OTHER_GSC, OTHER_TENANT),
      ],
    },
    rpc: { is_super_admin: () => superAdmin },
    other: () => Response.json({ rows: [] }),
  });

  const response = await withRuntime({ env, fetch: http.fetch }, async () => {
    const handler = await servedHandler(new URL("./index.ts", import.meta.url));

    return await handler(
      new Request("https://edge.test/sync-google-search-console-data", {
        method: "POST",
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
        body: JSON.stringify({
          tableId,
          startDate: "2026-11-01",
          endDate: "2026-11-02",
        }),
      }),
    );
  });

  return {
    status: response.status,
    body: await response.json(),
    googleCalls: http.calls.filter(
      (call) => call.url.hostname === "www.googleapis.com",
    ).length,
    secretReads: http.calls.filter((call) =>
      call.url.pathname.endsWith("/integration_secrets"),
    ).length,
  };
}

Deno.test("a sync needs a session", async () => {
  const missing = await sync(null, OWN_TABLE);
  const unknown = await sync("nobody", OWN_TABLE);

  assertEquals([missing.status, unknown.status], [401, 401]);
  assertEquals(missing.secretReads + unknown.secretReads, 0);
});

Deno.test(
  "an outsider gets the same refusal for a real table and a missing one",
  async () => {
    const real = await sync("outsider", OWN_TABLE);
    const missing = await sync("outsider", MISSING_TABLE);

    assertEquals({ status: real.status, body: real.body }, DENIED);
    assertEquals({ status: missing.status, body: missing.body }, DENIED);
    assertEquals(real.secretReads + real.googleCalls, 0);
  },
);

Deno.test(
  "a member cannot sync with another organization's connection",
  async () => {
    const result = await sync("member", OTHER_GSC_TABLE);

    assertEquals({ status: result.status, body: result.body }, DENIED);
    assertEquals(result.secretReads + result.googleCalls, 0);
  },
);

Deno.test(
  "a member syncs with a connection of an organization they belong to",
  async () => {
    const own = await sync("member", OWN_TABLE);
    const second = await sync("member", SECOND_GSC_TABLE);

    assertEquals([own.status, second.status], [200, 200]);
    assertEquals(own.body, { success: true, records_synced: 0 });
    assertEquals([own.googleCalls, second.googleCalls], [1, 1]);
  },
);

Deno.test(
  "a super admin syncs any table, but only with a connection of its organization",
  async () => {
    const own = await sync("outsider", OWN_TABLE, true);
    const other = await sync("outsider", OTHER_GSC_TABLE, true);

    assertEquals(own.status, 200);
    assertEquals({ status: other.status, body: other.body }, DENIED);
    assertEquals(other.secretReads + other.googleCalls, 0);
  },
);
