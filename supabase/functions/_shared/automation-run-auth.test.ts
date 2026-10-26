import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  authorizeDirectAutomationRun,
  authorizeTenantCaller,
  bearerToken,
} from "./automation-run-auth.ts";

const SERVICE = "service-key";
const TENANT = "tenant-a";

type User = {
  id: string;
  tenant: string;
  owner?: boolean;
  superAdmin?: boolean;
};
const users: Record<string, User> = {
  "owner-a": { id: "u1", tenant: TENANT, owner: true },
  "owner-b": { id: "u2", tenant: "tenant-b", owner: true },
  "member-a": { id: "u3", tenant: TENANT },
  super: { id: "u4", tenant: "tenant-x", superAdmin: true },
};

const client = {
  auth: {
    getUser: async (token: string) => {
      const u = users[token];
      return u
        ? { data: { user: { id: u.id } }, error: null }
        : { data: { user: null }, error: new Error("bad jwt") };
    },
  },
  rpc: async (fn: string, args: { _user_id: string }) => {
    const u = Object.values(users).find((x) => x.id === args._user_id)!;
    if (fn === "get_user_tenant_id") return { data: u.tenant, error: null };
    if (fn === "has_role") return { data: !!u.owner, error: null };
    if (fn === "is_super_admin") return { data: !!u.superAdmin, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  },
};

const run = (token: string) =>
  authorizeDirectAutomationRun(client, token, SERVICE, TENANT);

Deno.test("service role may run any automation", async () => {
  assertEquals(await run(SERVICE), { allowed: true });
});

Deno.test("tenant owner may run their automation", async () => {
  assertEquals(await run("owner-a"), { allowed: true });
});

Deno.test("super admin may run it", async () => {
  assertEquals(await run("super"), { allowed: true });
});

Deno.test("owner of another tenant is refused", async () => {
  const d = await run("owner-b");
  assertStrictEquals(d.allowed, false);
  assertStrictEquals(!d.allowed && d.status, 403);
});

Deno.test("non-owner member is refused", async () => {
  const d = await run("member-a");
  assertStrictEquals(!d.allowed && d.status, 403);
});

Deno.test("anon or invalid token is refused", async () => {
  assertStrictEquals((await run("anon-key")).allowed, false);
  assertStrictEquals((await run("")).allowed, false);
  const d = await run("anon-key");
  assertStrictEquals(!d.allowed && d.status, 401);
});

Deno.test("bearerToken strips the scheme", () => {
  assertStrictEquals(bearerToken("Bearer abc"), "abc");
  assertStrictEquals(bearerToken(null), "");
});

// authorizeTenantCaller: the caller client answers user_is_tenant_member for
// the user whose JWT it carries.
const callerHeaders: string[] = [];
const asCaller = (authHeader: string) => {
  callerHeaders.push(authHeader);
  const u = users[bearerToken(authHeader)];
  return {
    rpc: async (fn: string, args: { check_tenant_id: string }) => {
      if (fn !== "user_is_tenant_member") throw new Error(`unexpected ${fn}`);
      return { data: !!u && u.tenant === args.check_tenant_id, error: null };
    },
  };
};

const tenantRun = (token: string, tenantId: unknown = TENANT) =>
  authorizeTenantCaller(
    client,
    asCaller,
    token ? `Bearer ${token}` : null,
    SERVICE,
    tenantId,
  );

Deno.test(
  "tenant caller: service role is allowed without a caller client",
  async () => {
    callerHeaders.length = 0;
    assertEquals(await tenantRun(SERVICE, null), { allowed: true });
    assertEquals(callerHeaders, []);
  },
);

Deno.test("tenant caller: a member of the body tenant is allowed", async () => {
  assertEquals(await tenantRun("member-a"), { allowed: true });
  assertEquals(await tenantRun("owner-a"), { allowed: true });
});

Deno.test(
  "tenant caller: a super admin of another tenant is allowed",
  async () => {
    assertEquals(await tenantRun("super"), { allowed: true });
  },
);

Deno.test("tenant caller: a member of another tenant is refused", async () => {
  const d = await tenantRun("owner-b");
  assertStrictEquals(!d.allowed && d.status, 403);
});

Deno.test("tenant caller: anon or missing token is refused", async () => {
  const anon = await tenantRun("anon-key");
  assertStrictEquals(!anon.allowed && anon.status, 401);
  const none = await tenantRun("");
  assertStrictEquals(!none.allowed && none.status, 401);
});

Deno.test(
  "tenant caller: a user without a body tenant_id gets 400",
  async () => {
    const d = await tenantRun("member-a", null);
    assertStrictEquals(!d.allowed && d.status, 400);
    const blank = await tenantRun("member-a", "");
    assertStrictEquals(!blank.allowed && blank.status, 400);
  },
);
