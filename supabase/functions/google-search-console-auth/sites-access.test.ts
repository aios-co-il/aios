import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import { withRuntime } from "../_shared/testing/served-handler.ts";
import { refuseGscSitesAccess } from "./sites-access.ts";

const SUPABASE_URL = "https://gsc-test.supabase.co";

const MEMBER = "11111111-1111-4111-8111-111111111111";

const OUTSIDER = "22222222-2222-4222-8222-222222222222";

const CLIENT = "33333333-3333-4333-8333-333333333333";

const CLIENT_TENANT = "44444444-4444-4444-8444-444444444444";

const AGENCY = "55555555-5555-4555-8555-555555555555";

const AGENCY_TENANT = "66666666-6666-4666-8666-666666666666";

const OTHER_TENANT = "77777777-7777-4777-8777-777777777777";

const AGENCY_GSC = "88888888-8888-4888-8888-888888888888";

const OTHER_GSC = "99999999-9999-4999-8999-999999999999";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
};

/**
 * A member of the client's organization and an outsider. The fake has no RLS,
 * so `visibleClient: false` leaves the client out, as RLS would for a caller
 * who may not see it. `failing` makes those tables or functions answer an error.
 */
async function run<T>(
  fn: () => Promise<T>,
  visibleClient = true,
  failing: Record<string, string> = {},
): Promise<T> {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER, outsider: OUTSIDER },
    tables: {
      clients: visibleClient
        ? [{ id: CLIENT, tenant_id: CLIENT_TENANT, agency_id: AGENCY }]
        : [],
      agency_tenant_access: [
        {
          agency_id: AGENCY,
          accessing_tenant_id: CLIENT_TENANT,
          source_tenant_id: AGENCY_TENANT,
        },
      ],
      tenant_users: [{ tenant_id: CLIENT_TENANT, user_id: MEMBER }],
      tenant_integrations: [
        {
          id: AGENCY_GSC,
          tenant_id: AGENCY_TENANT,
          integration_type: "google_search_console",
        },
        {
          id: OTHER_GSC,
          tenant_id: OTHER_TENANT,
          integration_type: "google_search_console",
        },
      ],
    },
    rpc: {
      is_super_admin: () => false,
      user_has_integration_permission: () => false,
    },
    failing,
  });

  return await withRuntime({ env, fetch: http.fetch }, fn);
}

Deno.test("listing sites needs a session", async () => {
  assertEquals(
    (await run(() => refuseGscSitesAccess(null, AGENCY_GSC, undefined)))
      ?.status,
    401,
  );
});

Deno.test("an outsider cannot list another organization's sites", async () => {
  assertEquals(
    (
      await run(() =>
        refuseGscSitesAccess("Bearer outsider", OTHER_GSC, undefined),
      )
    )?.status,
    403,
  );
  assertEquals(
    (await run(() => refuseGscSitesAccess("Bearer member", OTHER_GSC, CLIENT)))
      ?.status,
    403,
  );
});

Deno.test(
  "a caller who sees the client lists sites of a connection serving it",
  async () => {
    assertEquals(
      await run(() =>
        refuseGscSitesAccess("Bearer member", AGENCY_GSC, CLIENT),
      ),
      null,
    );
  },
);

Deno.test(
  "a failed membership lookup keeps the database message out of the error",
  async () => {
    const error = await assertRejects(() =>
      run(
        () => refuseGscSitesAccess("Bearer member", AGENCY_GSC, CLIENT),
        true,
        { tenant_users: "relation secret_internal_table does not exist" },
      ),
    );

    assertEquals(
      error instanceof Error ? error.message : null,
      "Access check failed",
    );
  },
);
