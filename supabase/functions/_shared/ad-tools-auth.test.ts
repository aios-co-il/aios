import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  adToolAccess,
  authorizeAdToolCaller,
  authorizeFbToolRequest,
  fbTokenSource,
} from "./ad-tools-auth.ts";
import {
  A,
  ANON_KEY,
  B,
  CA,
  CB,
  CRW,
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
    fetchAccountId: async (src, entityId) => {
      calls.push(
        `fetchAccountId:${src.tenantId}:${src.clientId ?? "own"}:${entityId}`,
      );
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
  // The env key is trimmed, as in edge-caller-auth.
  const padded = await authorizeAdToolCaller({
    authorization: `Bearer ${SERVICE}`,
    serviceRoleKey: `${SERVICE}\n`,
    bodyTenantId: B,
    access: "write",
    identity: identity(),
  });
  assertStrictEquals(padded.ok, true);
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
      client_id: CA,
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
    client_id: CRW,
    name: "x",
  });
  assertStrictEquals(create.ok, true);
});

Deno.test(
  "fb-tools: a user acts only with their own tenant's token",
  async () => {
    // The Meta object is read with A's own token, never cRW's tenant's.
    const calls: string[] = [];
    const res = await fbGate(
      tokenOf("ownerA"),
      { ...pause("9003"), client_id: CRW },
      calls,
    );
    assertStrictEquals(res.ok, true);
    assertEquals(calls, ["getUserId", `fetchAccountId:${A}:own:9003`]);
    if (!res.ok) return;
    assertEquals(fbTokenSource(res.caller, CRW), {
      tenantId: A,
      clientId: null,
    });
    // The service role keeps the client-owning tenant's token.
    assertEquals(fbTokenSource({ kind: "service_role", tenantId: B }, CRW), {
      tenantId: B,
      clientId: CRW,
    });
    assertEquals(fbTokenSource({ kind: "service_role", tenantId: B }, ""), {
      tenantId: B,
      clientId: null,
    });
  },
);

Deno.test(
  "fb-tools: the Meta object must sit under the named client",
  async () => {
    // 9001 is cA's (tenant A), but the call names the shared client cRW.
    denied(
      await fbGate(tokenOf("ownerA"), { ...pause("9001"), client_id: CRW }),
      403,
      "target_out_of_scope",
    );
    assertStrictEquals(
      (await fbGate(tokenOf("ownerA"), { ...pause("9001"), client_id: CA })).ok,
      true,
    );
  },
);

Deno.test(
  "fb-tools: an uppercase client_id names the same client",
  async () => {
    const owner = tokenOf("ownerA");
    const upper = await fbGate(owner, {
      ...pause("9001"),
      client_id: CA.toUpperCase(),
    });
    assertStrictEquals(upper.ok, true);
    // Still not the client the Meta object sits under.
    denied(
      await fbGate(owner, { ...pause("9001"), client_id: CRW.toUpperCase() }),
      403,
      "target_out_of_scope",
    );
  },
);

Deno.test(
  "fb-tools: an object the tenant's own Meta token cannot read",
  async () => {
    // 9999 is unknown to A's token (fetchAccountId answers null).
    const res = await fbGate(tokenOf("ownerA"), pause("9999"));
    denied(res, 403, "fb_object_unreachable");
    assertStrictEquals(!res.ok && res.message?.includes("Meta"), true);
    // Readable but linked to no client in scope: still out of scope.
    denied(
      await fbGate(tokenOf("ownerA"), pause("9002")),
      403,
      "target_out_of_scope",
    );
  },
);

Deno.test("fb-tools: a client_id that is not a uuid gets 400", async () => {
  for (const client_id of ["abc", "cA", " " + CA, 42])
    denied(
      await fbGate(tokenOf("ownerA"), { ...pause("9001"), client_id }),
      400,
      "invalid_client_id",
    );
});

Deno.test("fb-tools: owner is refused outside scope", async () => {
  const owner = tokenOf("ownerA");
  denied(await fbGate(owner, pause("9002")), 403, "target_out_of_scope");
  // Shared read_only: no writes.
  denied(await fbGate(owner, pause("9004")), 403, "target_out_of_scope");
  // Ad account not linked to any client.
  denied(await fbGate(owner, pause("9005")), 403, "target_out_of_scope");
  // A foreign client_id would also pick that client's FB token.
  denied(
    await fbGate(owner, { ...pause("9001"), client_id: CB }),
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
  assertEquals(calls, ["getUserId", `fetchAccountId:${A}:own:9001`]);
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

Deno.test(
  "fb-tools: super admin is refused where the tenant opted out",
  async () => {
    // Tenant B has allow_super_admin_access off, as the RLS policies honour.
    denied(
      await fbGate(tokenOf("superAdminInB"), pause("9002", B)),
      403,
      "not_tenant_member",
    );
  },
);
