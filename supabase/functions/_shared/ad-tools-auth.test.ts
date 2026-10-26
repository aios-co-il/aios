import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  adToolAccess,
  authorizeAdToolCaller,
  authorizeFbToolRequest,
} from "./ad-tools-auth.ts";
import {
  A,
  ANON_KEY,
  B,
  FOREIGN_SERVICE_KEY,
  META_OBJECTS,
  SERVICE,
  identity,
  store,
  tokenOf,
} from "./ad-tools-test-fixtures.ts";

function fbGate(
  bearer: string | null,
  body: Record<string, unknown>,
  calls: string[] = [],
) {
  return authorizeFbToolRequest({
    authorization: bearer === null ? null : `Bearer ${bearer}`,
    serviceRoleKey: SERVICE,
    body: { confirmed: true, ...body },
    identity: identity(calls),
    store: store(),
    fetchAccountId: async (tenantId, entityId) => {
      calls.push(`fetchAccountId:${tenantId}:${entityId}`);
      return META_OBJECTS[entityId] ?? null;
    },
  });
}

const pause = (entity_id: string, tenant_id: string = A) => ({
  action: "pause",
  entity_id,
  tenant_id,
});

function denied(
  res: Awaited<ReturnType<typeof fbGate>>,
  status: number,
  error?: string,
) {
  assertStrictEquals(res.ok, false);
  if (res.ok) return;
  assertStrictEquals(res.status, status);
  if (error) assertStrictEquals(res.error, error);
}

Deno.test("fb-tools: every current action is a write", () => {
  for (const action of ["pause", "resume", "update_budget", "create_ad", "x"])
    assertStrictEquals(adToolAccess("carmen-fb-tools", action), "write");
});

Deno.test("fb-tools: no bearer, anon key or bad JWT get 401", async () => {
  const calls: string[] = [];
  denied(await fbGate(null, pause("9001")), 401);
  denied(await fbGate(ANON_KEY, pause("9001"), calls), 401);
  denied(await fbGate(FOREIGN_SERVICE_KEY, pause("9001"), calls), 401);
  assertEquals(calls, []); // refused before any lookup
  denied(await fbGate("not-a-jwt", pause("9001")), 401);
});

Deno.test("fb-tools: service role keeps the body tenant", async () => {
  const calls: string[] = [];
  const res = await fbGate(SERVICE, pause("9002", B), calls);
  assertEquals(res, {
    ok: true,
    caller: { kind: "service_role", tenantId: B },
  });
  assertEquals(calls, []); // trusted caller: no user or target lookups
  denied(await fbGate(SERVICE, { action: "pause" }), 400);
});

Deno.test("fb-tools: a user of another tenant is refused", async () => {
  // Owner of B names tenant A and A's campaign.
  denied(
    await fbGate(tokenOf("ownerB"), pause("9001", A)),
    403,
    "target_out_of_scope",
  );
  denied(
    await fbGate(tokenOf("ownerB"), {
      action: "create_campaign",
      client_id: "cA",
      name: "x",
      tenant_id: A,
    }),
    403,
    "target_out_of_scope",
  );
});

Deno.test("fb-tools: campaigner may read but not write", async () => {
  const calls: string[] = [];
  denied(
    await fbGate(tokenOf("campaignerA"), pause("9001"), calls),
    403,
    "approver_role_required",
  );
  assertEquals(calls, ["getUserId"]); // no Graph call for a refused write
  const read = await authorizeAdToolCaller({
    authorization: `Bearer ${tokenOf("campaignerA")}`,
    serviceRoleKey: SERVICE,
    bodyTenantId: B,
    access: "read",
    identity: identity(),
  });
  assertEquals(read, {
    ok: true,
    caller: {
      kind: "user",
      userId: "u-campaigner-a",
      tenantId: A,
      isApprover: false,
    },
  });
});

Deno.test("fb-tools: owner and agency owner may write in scope", async () => {
  for (const user of ["ownerA", "agencyOwnerA"] as const) {
    const res = await fbGate(tokenOf(user), pause("9001"));
    assertStrictEquals(res.ok && res.caller.tenantId, A);
  }
  // Agency shared read_write with A.
  assertStrictEquals((await fbGate(tokenOf("ownerA"), pause("9003"))).ok, true);
  const create = await fbGate(tokenOf("ownerA"), {
    action: "create_campaign",
    client_id: "cRW",
    name: "x",
  });
  assertStrictEquals(create.ok, true);
});

Deno.test("fb-tools: owner is refused outside scope", async () => {
  const owner = tokenOf("ownerA");
  denied(await fbGate(owner, pause("9002")), 403, "target_out_of_scope");
  // Shared read_only: no writes.
  denied(await fbGate(owner, pause("9004")), 403, "target_out_of_scope");
  // Ad account not linked to any client, or unknown to the token.
  denied(await fbGate(owner, pause("9005")), 403, "target_out_of_scope");
  denied(await fbGate(owner, pause("9999")), 403, "target_out_of_scope");
  // A foreign client_id would also pick that client's FB token.
  denied(
    await fbGate(owner, { ...pause("9001"), client_id: "cB" }),
    403,
    "target_out_of_scope",
  );
  denied(
    await fbGate(owner, pause("act_222/campaigns")),
    400,
    "invalid_entity_id",
  );
});

Deno.test("fb-tools: a forged body tenant_id is ignored", async () => {
  const calls: string[] = [];
  const res = await fbGate(tokenOf("ownerA"), pause("9001", B), calls);
  assertStrictEquals(res.ok && res.caller.tenantId, A);
  assertEquals(calls, ["getUserId", `fetchAccountId:${A}:9001`]);
  denied(
    await fbGate(tokenOf("ownerA"), pause("9002", B)),
    403,
    "target_out_of_scope",
  );
});

Deno.test("fb-tools: active tenant must be a real membership", async () => {
  denied(
    await fbGate(tokenOf("spoofer"), pause("9002", B)),
    403,
    "not_tenant_member",
  );
});

Deno.test("fb-tools: super admin acts in the active tenant only", async () => {
  const res = await fbGate(tokenOf("superAdmin"), pause("9001"));
  assertStrictEquals(res.ok && res.caller.tenantId, A);
  denied(
    await fbGate(tokenOf("superAdmin"), pause("9002", B)),
    403,
    "target_out_of_scope",
  );
});
