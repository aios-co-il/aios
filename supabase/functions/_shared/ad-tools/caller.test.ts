import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { ANON_KEY, FOREIGN_SERVICE_KEY } from "../auth/jwt-test-fixtures.ts";
import {
  adToolAccess,
  type AdToolAuthResult,
  authorizeAdToolCaller,
} from "./caller.ts";
import type { AdToolAccess } from "./scope.ts";
import { A, B, SERVICE, identity, tokenOf } from "./test-fixtures.ts";

function caller(
  bearer: string | null,
  bodyTenantId: unknown,
  access: AdToolAccess = "write",
  calls: string[] = [],
) {
  return authorizeAdToolCaller({
    authorization: bearer === null ? null : `Bearer ${bearer}`,
    serviceRoleKey: SERVICE,
    bodyTenantId,
    access,
    identity: identity(calls),
  });
}

function denied(res: AdToolAuthResult, status: number, error?: string) {
  assertStrictEquals(res.ok, false);
  if (res.ok) {
    return;
  }
  assertStrictEquals(res.status, status);
  if (error) {
    assertStrictEquals(res.error, error);
  }
}

Deno.test("adToolAccess: every carmen-fb-tools action is a write", () => {
  for (const action of ["pause", "resume", "update_budget", "create_ad", "x"]) {
    assertStrictEquals(adToolAccess("carmen-fb-tools", action), "write");
  }
});

Deno.test("adToolAccess: carmen-google-tools actions are writes", () => {
  for (const action of ["pause", "resume", "update_budget"]) {
    assertStrictEquals(adToolAccess("carmen-google-tools", action), "write");
  }
});

Deno.test(
  "authorizeAdToolCaller: no bearer, anon key or bad JWT get 401",
  async () => {
    const calls: string[] = [];
    denied(await caller(null, A), 401);
    denied(await caller(ANON_KEY, A, "write", calls), 401);
    denied(await caller(FOREIGN_SERVICE_KEY, A, "write", calls), 401);
    assertEquals(calls, []); // refused before any lookup
    denied(await caller("not-a-jwt", A), 401);
  },
);

Deno.test(
  "authorizeAdToolCaller: service role keeps the body tenant",
  async () => {
    const calls: string[] = [];
    assertEquals(await caller(SERVICE, B, "write", calls), {
      ok: true,
      caller: { kind: "service_role", tenantId: B },
    });
    assertEquals(calls, []); // trusted caller: no user lookups
    denied(await caller(SERVICE, undefined), 400);
    // The env key is trimmed, as in edge-caller-auth.
    const padded = await authorizeAdToolCaller({
      authorization: `Bearer ${SERVICE}`,
      serviceRoleKey: `${SERVICE}\n`,
      bodyTenantId: B,
      access: "write",
      identity: identity(),
    });
    assertStrictEquals(padded.ok, true);
  },
);

Deno.test(
  "authorizeAdToolCaller: campaigner may read but not write",
  async () => {
    denied(
      await caller(tokenOf("campaignerA"), A),
      403,
      "approver_role_required",
    );
    assertEquals(await caller(tokenOf("campaignerA"), B, "read"), {
      ok: true,
      caller: {
        kind: "user",
        userId: "u-campaigner-a",
        tenantId: A,
        isApprover: false,
      },
    });
  },
);

Deno.test(
  "authorizeAdToolCaller: active tenant must be a real membership",
  async () => {
    denied(await caller(tokenOf("spoofer"), B), 403, "not_tenant_member");
  },
);

Deno.test(
  "authorizeAdToolCaller: super admin acts in the active tenant",
  async () => {
    const res = await caller(tokenOf("superAdmin"), A);
    assertStrictEquals(res.ok && res.caller.tenantId, A);
  },
);

Deno.test(
  "authorizeAdToolCaller: super admin is refused where the tenant opted out",
  async () => {
    // Tenant B has allow_super_admin_access off, as the RLS policies honour.
    denied(await caller(tokenOf("superAdminInB"), B), 403, "not_tenant_member");
  },
);
