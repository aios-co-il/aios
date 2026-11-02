import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  authorizeMergeCaller,
  type CallerRoles,
  type MergeAccess,
  type MergeAuth,
} from "./caller-access.ts";

const TENANT = "tenant-a";

type Person = { acting: string; owner?: boolean; superAdmin?: boolean };

const people: Record<string, Person> = {
  "owner-a": { acting: TENANT, owner: true },
  "member-a": { acting: TENANT },
  "owner-b": { acting: "tenant-b", owner: true },
  "super-in-a": { acting: TENANT, superAdmin: true },
  "super-in-b": { acting: "tenant-b", superAdmin: true },
};

/** Fake caller client: answers the role lookups for the signed-in person. */
function rolesOf(userId: string): CallerRoles {
  return {
    rpc: async (fn: string, args: { _user_id: string; _role?: string }) => {
      const person = people[args._user_id];
      if (args._user_id !== userId || !person) {
        throw new Error(`lookup for another user: ${args._user_id}`);
      }
      const data =
        fn === "get_user_tenant_id"
          ? person.acting
          : fn === "has_role"
            ? args._role === "owner" && person.owner === true
            : person.superAdmin === true;
      return { data, error: null };
    },
  };
}

const signedIn = (userId: string): MergeAuth => ({ kind: "user", userId });

const check = (userId: string, tenantId: unknown = TENANT) =>
  authorizeMergeCaller(signedIn(userId), () => rolesOf(userId), tenantId);

const denied: MergeAccess = {
  allowed: false,
  status: 403,
  error: "Only the tenant's owner can merge its duplicate leads",
};

Deno.test("anon or no user gets 401", async () => {
  const noLookups = (): CallerRoles => {
    throw new Error("no lookup without a user");
  };
  const unauthorized: MergeAccess = {
    allowed: false,
    status: 401,
    error: "Unauthorized",
  };
  assertEquals(
    await authorizeMergeCaller(null, noLookups, TENANT),
    unauthorized,
  );
  assertEquals(
    await authorizeMergeCaller(
      { kind: "service", userId: null },
      noLookups,
      TENANT,
    ),
    unauthorized,
  );
});

Deno.test("a member of the tenant who is not its owner gets 403", async () => {
  assertEquals(await check("member-a"), denied);
});

Deno.test("an owner of another tenant gets 403", async () => {
  assertEquals(await check("owner-b"), denied);
});

Deno.test("a super admin acting in a different tenant gets 403", async () => {
  assertEquals(await check("super-in-b"), denied);
});

Deno.test("the tenant's owner may merge", async () => {
  assertEquals(await check("owner-a"), { allowed: true });
});

Deno.test("a super admin acting in the tenant may merge", async () => {
  assertEquals(await check("super-in-a"), { allowed: true });
});

Deno.test("a signed-in caller without tenant_id gets 400", async () => {
  assertEquals(await check("owner-a", ""), {
    allowed: false,
    status: 400,
    error: "tenant_id is required",
  });
});

Deno.test("a failed role lookup throws instead of allowing", async () => {
  const failing: CallerRoles = {
    rpc: async () => ({ data: null, error: { message: "timeout" } }),
  };
  await assertRejects(
    () => authorizeMergeCaller(signedIn("owner-a"), () => failing, TENANT),
    Error,
    "timeout",
  );
});
