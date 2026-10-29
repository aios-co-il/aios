import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import {
  authorizeManusSend,
  isAnonToken,
  jwtRole,
  type ManusSendAuthResult,
} from "./send-auth.ts";
import { ANON_KEY, jwt, SERVICE_KEY } from "./test-fixtures.ts";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const USER_B = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const SUPER = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
const LINE_A = "ca11ca11-ca11-4a11-8a11-ca11ca11ca11";

const FOREIGN_SERVICE = jwt({ role: "service_role", ref: "other" });
const TOKENS: Record<string, string> = {
  [jwt({ role: "authenticated", sub: USER_A })]: USER_A,
  [jwt({ role: "authenticated", sub: USER_B })]: USER_B,
  [jwt({ role: "authenticated", sub: SUPER })]: SUPER,
};
const tokenFor = (userId: string) =>
  Object.keys(TOKENS).find((t) => TOKENS[t] === userId);

/** USER_A is a member of A and USER_B of B; LINE_A is shared with B when `shared`. Counts user lookups. */
function db({ shared = false } = {}) {
  const supabase = fakeSupabase(
    {
      tenant_users: [
        { tenant_id: TENANT_A, user_id: USER_A },
        { tenant_id: TENANT_B, user_id: USER_B },
      ],
    },
    {
      users: TOKENS,
      rpc: {
        is_super_admin: ({ _user_id }) => _user_id === SUPER,
        tenant_can_use_integration: ({ p_tenant_id, p_integration_id }) =>
          shared && p_tenant_id === TENANT_B && p_integration_id === LINE_A,
      },
    },
  );
  const calls = { getUserId: 0 };
  const getUser = supabase.auth.getUser;
  supabase.auth.getUser = (token: string) => {
    calls.getUserId += 1;
    return getUser(token);
  };
  return { calls, supabase };
}

const integrationA = { id: LINE_A, tenant_id: TENANT_A };

/** authorizeManusSend for a bearer token (none when null). */
async function authorize(
  token: string | null | undefined,
  {
    integration = integrationA,
    requestedTenantId = null,
    shared,
  }: {
    integration?: { id: string; tenant_id: string | null } | null;
    requestedTenantId?: string | null;
    shared?: boolean;
  } = {},
) {
  const d = db({ shared });
  const result = await authorizeManusSend({
    authorization: token ? `Bearer ${token}` : null,
    serviceRoleKey: SERVICE_KEY,
    integration,
    requestedTenantId,
    supabase: d.supabase,
  });
  return { result, calls: d.calls };
}

Deno.test("jwtRole / isAnonToken", async (t) => {
  await t.step("read the role claim", () => {
    assertStrictEquals(jwtRole(ANON_KEY), "anon");
    assertStrictEquals(jwtRole("not-a-jwt"), null);
    assertStrictEquals(isAnonToken(ANON_KEY, SERVICE_KEY), true);
    assertStrictEquals(isAnonToken(SERVICE_KEY, SERVICE_KEY), false);
    assertStrictEquals(isAnonToken(tokenFor(USER_A), SERVICE_KEY), false);
  });
});

Deno.test("authorizeManusSend", async (t) => {
  await t.step(
    "anon key and missing token get 401 without a user lookup",
    async () => {
      for (const token of [ANON_KEY, null]) {
        const { result, calls } = await authorize(token);
        assertEquals(result, { ok: false, status: 401, error: "Unauthorized" });
        assertStrictEquals(calls.getUserId, 0);
      }
    },
  );

  await t.step(
    "a service_role JWT that is not this project's key gets 401",
    async () => {
      const { result } = await authorize(FOREIGN_SERVICE);
      assertEquals(result, { ok: false, status: 401, error: "Unauthorized" });
    },
  );

  await t.step("this project's service-role key is accepted", async () => {
    const { result } = await authorize(SERVICE_KEY);
    assertEquals(result, { ok: true, caller: "service_role", userId: null });
    // run-ai-agent's call without tenantId and with an unknown integration keeps working
    const noIntegration = await authorize(SERVICE_KEY, { integration: null });
    assertStrictEquals(noIntegration.result.ok, true);
  });

  await t.step(
    "a user of another tenant gets 403; a user of the tenant is accepted",
    async () => {
      const other = await authorize(tokenFor(USER_B));
      assertEquals(other.result, {
        ok: false,
        status: 403,
        error: "Forbidden",
      });

      const own = await authorize(tokenFor(USER_A));
      assertEquals(own.result, { ok: true, caller: "user", userId: USER_A });

      const superAdmin = await authorize(tokenFor(SUPER));
      assertStrictEquals(superAdmin.result.ok, true);
    },
  );

  await t.step(
    "a user may use another tenant's integration only when it is shared",
    async () => {
      const notShared = await authorize(tokenFor(USER_B), {
        requestedTenantId: TENANT_B,
      });
      assertEquals(notShared.result, {
        ok: false,
        status: 403,
        error: "Forbidden",
      });
      const shared = await authorize(tokenFor(USER_B), {
        requestedTenantId: TENANT_B,
        shared: true,
      });
      assertStrictEquals(shared.result.ok, true);
    },
  );

  await t.step("an invalid user token gets 401", async () => {
    const bogus = await authorize(
      jwt({ role: "authenticated", sub: "nobody" }),
    );
    assertEquals(bogus.result, {
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  await t.step(
    "only a member learns that an integration is missing (404); anyone else gets 403",
    async () => {
      const ask = (userId: string, requestedTenantId: string | null) =>
        authorize(tokenFor(userId), { integration: null, requestedTenantId });
      assertEquals((await ask(USER_A, TENANT_A)).result, {
        ok: false,
        status: 404,
        error: "Integration not found",
      });
      const forbidden: ManusSendAuthResult = {
        ok: false,
        status: 403,
        error: "Forbidden",
      };
      assertEquals((await ask(USER_B, TENANT_A)).result, forbidden);
      assertEquals((await ask(USER_A, null)).result, forbidden);
    },
  );
});
