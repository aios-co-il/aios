import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  authorizeManusSend,
  isAnonToken,
  jwtRole,
  type ManusSendAuthDeps,
} from "./send-auth.ts";
import { ANON_KEY, jwt, SERVICE_KEY } from "./test-fixtures.ts";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "user-of-a";
const USER_B = "user-of-b";
const SUPER = "super-admin";

const FOREIGN_SERVICE = jwt({ role: "service_role", ref: "other" });
const TOKENS: Record<string, string> = {
  [jwt({ role: "authenticated", sub: USER_A })]: USER_A,
  [jwt({ role: "authenticated", sub: USER_B })]: USER_B,
  [jwt({ role: "authenticated", sub: SUPER })]: SUPER,
};
const tokenFor = (userId: string) =>
  Object.keys(TOKENS).find((t) => TOKENS[t] === userId);

/** Membership of USER_A in A and USER_B in B; manus-a is shared with B when `shared`. */
function deps({ shared = false } = {}) {
  const calls = { getUserId: 0 };
  const lookups: ManusSendAuthDeps = {
    getUserId(token) {
      calls.getUserId += 1;
      return Promise.resolve(TOKENS[token] ?? null);
    },
    isTenantMember(tenantId, userId) {
      return Promise.resolve(
        (tenantId === TENANT_A && userId === USER_A) ||
          (tenantId === TENANT_B && userId === USER_B),
      );
    },
    isSuperAdmin(userId) {
      return Promise.resolve(userId === SUPER);
    },
    tenantCanUseIntegration(tenantId, integrationId) {
      return Promise.resolve(
        shared && tenantId === TENANT_B && integrationId === "manus-a",
      );
    },
  };
  return { calls, deps: lookups };
}

const integrationA = { id: "manus-a", tenant_id: TENANT_A };

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
  const d = deps({ shared });
  const result = await authorizeManusSend({
    authorization: token ? `Bearer ${token}` : null,
    serviceRoleKey: SERVICE_KEY,
    integration,
    requestedTenantId,
    deps: d.deps,
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

  await t.step(
    "an invalid user token gets 401; a missing integration gets 404",
    async () => {
      const bogus = await authorize(
        jwt({ role: "authenticated", sub: "nobody" }),
      );
      assertEquals(bogus.result, {
        ok: false,
        status: 401,
        error: "Unauthorized",
      });
      const missing = await authorize(tokenFor(USER_A), { integration: null });
      assertEquals(missing.result, {
        ok: false,
        status: 404,
        error: "Integration not found",
      });
    },
  );
});
