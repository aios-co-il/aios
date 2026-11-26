import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import { withRuntime } from "../_shared/testing/served-handler.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { refuseGscSync } from "./sync-access.ts";

const SUPABASE_URL = "https://gsc-sync-test.supabase.co";

const MEMBER = "11111111-1111-4111-8111-111111111111";

const OUTSIDER = "22222222-2222-4222-8222-222222222222";

const OWN_TENANT = "33333333-3333-4333-8333-333333333333";

const SECOND_TENANT = "44444444-4444-4444-8444-444444444444";

const OTHER_TENANT = "55555555-5555-4555-8555-555555555555";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
};

/**
 * The member belongs to OWN_TENANT and SECOND_TENANT; the outsider to none.
 * `superAdmin` makes the caller a super admin.
 */
async function refusalStatus(
  authHeader: string | null,
  tableTenantId: string,
  integrationTenantId: string,
  superAdmin = false,
): Promise<number | null> {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    users: { member: MEMBER, outsider: OUTSIDER },
    tables: {
      tenant_users: [
        { tenant_id: OWN_TENANT, user_id: MEMBER },
        { tenant_id: SECOND_TENANT, user_id: MEMBER },
      ],
    },
    rpc: { is_super_admin: () => superAdmin },
  });

  const refusal = await withRuntime({ env, fetch: http.fetch }, () =>
    refuseGscSync(
      serviceClient(),
      authHeader,
      tableTenantId,
      integrationTenantId,
    ),
  );

  return refusal?.status ?? null;
}

Deno.test("a sync needs a session", async () => {
  assertEquals(await refusalStatus(null, OWN_TENANT, OWN_TENANT), 401);
  assertEquals(
    await refusalStatus("Bearer nobody", OWN_TENANT, OWN_TENANT),
    401,
  );
});

Deno.test("an outsider cannot sync another organization's table", async () => {
  assertEquals(
    await refusalStatus("Bearer outsider", OWN_TENANT, OWN_TENANT),
    403,
  );
});

Deno.test(
  "a member cannot sync their table with another organization's connection",
  async () => {
    assertEquals(
      await refusalStatus("Bearer member", OWN_TENANT, OTHER_TENANT),
      403,
    );
  },
);

Deno.test(
  "a member syncs with a connection of an organization they belong to",
  async () => {
    assertEquals(
      await refusalStatus("Bearer member", OWN_TENANT, OWN_TENANT),
      null,
    );
    assertEquals(
      await refusalStatus("Bearer member", OWN_TENANT, SECOND_TENANT),
      null,
    );
  },
);

Deno.test(
  "a super admin syncs any table, but only with a connection of its organization",
  async () => {
    assertEquals(
      await refusalStatus("Bearer outsider", OWN_TENANT, OWN_TENANT, true),
      null,
    );
    assertEquals(
      await refusalStatus("Bearer outsider", OWN_TENANT, OTHER_TENANT, true),
      403,
    );
  },
);
