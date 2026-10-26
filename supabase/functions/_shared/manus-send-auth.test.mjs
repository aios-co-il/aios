import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import { authorizeManusSend, isAnonToken, jwtRole } from "./manus-send-auth.ts";

const SERVICE_KEY = "service-role-key-of-this-project";
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "user-of-a";
const USER_B = "user-of-b";
const SUPER = "super-admin";

function jwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.signature`;
}
const ANON_KEY = jwt({ role: "anon", ref: "proj" });
const FOREIGN_SERVICE = jwt({ role: "service_role", ref: "other" });
const TOKENS = {
  [jwt({ role: "authenticated", sub: USER_A })]: USER_A,
  [jwt({ role: "authenticated", sub: USER_B })]: USER_B,
  [jwt({ role: "authenticated", sub: SUPER })]: SUPER,
};
const tokenFor = (userId) =>
  Object.keys(TOKENS).find((t) => TOKENS[t] === userId);

function deps({ shared = false } = {}) {
  const calls = { getUserId: 0 };
  return {
    calls,
    deps: {
      async getUserId(token) {
        calls.getUserId += 1;
        return TOKENS[token] ?? null;
      },
      async isTenantMember(tenantId, userId) {
        return (
          (tenantId === TENANT_A && userId === USER_A) ||
          (tenantId === TENANT_B && userId === USER_B)
        );
      },
      async isSuperAdmin(userId) {
        return userId === SUPER;
      },
      async tenantCanUseIntegration(tenantId, integrationId) {
        return shared && tenantId === TENANT_B && integrationId === "manus-a";
      },
    },
  };
}

const integrationA = { id: "manus-a", tenant_id: TENANT_A };

async function authorize(
  token,
  { integration = integrationA, requestedTenantId = null, shared } = {},
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

Deno.test("jwtRole / isAnonToken read the role claim", () => {
  assertStrictEquals(jwtRole(ANON_KEY), "anon");
  assertStrictEquals(jwtRole("not-a-jwt"), null);
  assertStrictEquals(isAnonToken(ANON_KEY, SERVICE_KEY), true);
  assertStrictEquals(isAnonToken(SERVICE_KEY, SERVICE_KEY), false);
  assertStrictEquals(isAnonToken(tokenFor(USER_A), SERVICE_KEY), false);
});

Deno.test(
  "anon key and missing token get 401 without a user lookup",
  async () => {
    for (const token of [ANON_KEY, null]) {
      const { result, calls } = await authorize(token);
      assertEquals(result, { ok: false, status: 401, error: "Unauthorized" });
      assertStrictEquals(calls.getUserId, 0);
    }
  },
);

Deno.test(
  "a service_role JWT that is not this project's key gets 401",
  async () => {
    const { result } = await authorize(FOREIGN_SERVICE);
    assertStrictEquals(result.ok, false);
    assertStrictEquals(result.status, 401);
  },
);

Deno.test("this project's service-role key is accepted", async () => {
  const { result } = await authorize(SERVICE_KEY);
  assertEquals(result, { ok: true, caller: "service_role", userId: null });
  // run-ai-agent's call without tenantId and with an unknown integration keeps working
  const noIntegration = await authorize(SERVICE_KEY, { integration: null });
  assertStrictEquals(noIntegration.result.ok, true);
});

Deno.test(
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

Deno.test(
  "a user may use another tenant's integration only when it is shared",
  async () => {
    const notShared = await authorize(tokenFor(USER_B), {
      requestedTenantId: TENANT_B,
    });
    assertStrictEquals(notShared.result.status, 403);
    const shared = await authorize(tokenFor(USER_B), {
      requestedTenantId: TENANT_B,
      shared: true,
    });
    assertStrictEquals(shared.result.ok, true);
  },
);

Deno.test(
  "an invalid user token gets 401; a missing integration gets 404",
  async () => {
    const bogus = await authorize(
      jwt({ role: "authenticated", sub: "nobody" }),
    );
    assertStrictEquals(bogus.result.status, 401);
    const missing = await authorize(tokenFor(USER_A), { integration: null });
    assertStrictEquals(missing.result.status, 404);
  },
);

Deno.test(
  "manage-manus-wa authorizes and guards send_message before the gateway call",
  async () => {
    const source = await readFile(
      new URL("../manage-manus-wa/index.ts", import.meta.url),
      "utf8",
    );
    const start = source.indexOf('if (action === "send_message")');
    const auth = source.indexOf("authorizeManusSend(", start);
    const guard = source.indexOf("checkWhatsAppSend(", start);
    const gateway = source.indexOf("gatewayRest(", start);
    assert(start > 0 && auth > start && guard > auth && gateway > guard);
    assertMatch(source.slice(guard, gateway), /decision === "BLOCK"/);
    // Every action refuses the public anon key.
    assert(
      source.indexOf("isAnonToken(") <
        source.indexOf("createClient(SUPABASE_URL"),
    );
  },
);
