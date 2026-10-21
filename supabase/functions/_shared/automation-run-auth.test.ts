import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeDirectAutomationRun,
  bearerToken,
  jwtRole,
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

test("service role may run any automation", async () => {
  assert.deepEqual(await run(SERVICE), { allowed: true });
});

test("tenant owner may run their automation", async () => {
  assert.deepEqual(await run("owner-a"), { allowed: true });
});

test("super admin may run it", async () => {
  assert.deepEqual(await run("super"), { allowed: true });
});

test("owner of another tenant is refused", async () => {
  const d = await run("owner-b");
  assert.equal(d.allowed, false);
  assert.equal(!d.allowed && d.status, 403);
});

test("non-owner member is refused", async () => {
  const d = await run("member-a");
  assert.equal(!d.allowed && d.status, 403);
});

test("anon or invalid token is refused", async () => {
  assert.equal((await run("anon-key")).allowed, false);
  assert.equal((await run("")).allowed, false);
  const d = await run("anon-key");
  assert.equal(!d.allowed && d.status, 401);
});

test("bearerToken strips the scheme", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken(null), "");
});

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

test("a service_role JWT is accepted, an authenticated one is checked", async () => {
  assert.equal(jwtRole(jwt({ role: "service_role" })), "service_role");
  assert.deepEqual(await run(jwt({ role: "service_role" })), { allowed: true });
  const d = await run(jwt({ role: "authenticated" }));
  assert.equal(!d.allowed && d.status, 401);
});
