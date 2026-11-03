import { assertEquals } from "jsr:@std/assert@1";
import {
  canGrantRole,
  canManageMembers,
  isGlobalSuperAdmin,
} from "./role-grant.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const OWNERS = ["owner"];
const INVITERS = ["owner", "agency_owner"];
const ownerOfA = [{ role: "owner", tenant_id: TENANT_A }];
const superAdmin = [{ role: "super_admin", tenant_id: null }];

Deno.test("isGlobalSuperAdmin", async (t) => {
  await t.step("a global super_admin row counts", () => {
    assertEquals(isGlobalSuperAdmin(superAdmin), true);
  });

  await t.step("a tenant-scoped super_admin row does not", () => {
    assertEquals(
      isGlobalSuperAdmin([{ role: "super_admin", tenant_id: TENANT_A }]),
      false,
    );
  });
});

Deno.test("canGrantRole", async (t) => {
  await t.step("an owner grants a normal role in its own tenant", () => {
    assertEquals(canGrantRole(ownerOfA, TENANT_A, "campaigner", OWNERS), true);
  });

  await t.step("an owner of A grants nothing in tenant B", () => {
    assertEquals(canGrantRole(ownerOfA, TENANT_B, "campaigner", OWNERS), false);
    assertEquals(canGrantRole(ownerOfA, TENANT_B, "owner", OWNERS), false);
  });

  await t.step("an owner never grants super_admin, even in its tenant", () => {
    assertEquals(
      canGrantRole(ownerOfA, TENANT_A, "super_admin", OWNERS),
      false,
    );
  });

  await t.step("a tenant-scoped super_admin row is no super admin", () => {
    const scoped = [{ role: "super_admin", tenant_id: TENANT_A }];
    assertEquals(canGrantRole(scoped, TENANT_B, "owner", OWNERS), false);
    assertEquals(canGrantRole(scoped, TENANT_A, "super_admin", OWNERS), false);
  });

  await t.step("a super admin grants anything anywhere", () => {
    assertEquals(
      canGrantRole(superAdmin, TENANT_B, "super_admin", OWNERS),
      true,
    );
    assertEquals(canGrantRole(superAdmin, TENANT_B, "owner", OWNERS), true);
  });

  await t.step("only the listed admin roles count", () => {
    const agencyOwnerOfA = [{ role: "agency_owner", tenant_id: TENANT_A }];
    assertEquals(
      canGrantRole(agencyOwnerOfA, TENANT_A, "campaigner", OWNERS),
      false,
    );
    assertEquals(
      canGrantRole(agencyOwnerOfA, TENANT_A, "campaigner", INVITERS),
      true,
    );
  });

  await t.step("a resend (no role) still needs the tenant", () => {
    assertEquals(canGrantRole(ownerOfA, TENANT_A, undefined, INVITERS), true);
    assertEquals(canGrantRole(ownerOfA, TENANT_B, undefined, INVITERS), false);
  });
});

Deno.test("canManageMembers", async (t) => {
  await t.step("an owner manages its own tenant's members", () => {
    assertEquals(canManageMembers(ownerOfA, TENANT_A, TENANT_B), true);
  });

  await t.step("an owner of A manages nobody in B", () => {
    assertEquals(canManageMembers(ownerOfA, TENANT_B, TENANT_B), false);
  });

  await t.step("an agency owner or campaigner of A does not", () => {
    const agencyOwner = [{ role: "agency_owner", tenant_id: TENANT_A }];
    const campaigner = [{ role: "campaigner", tenant_id: TENANT_A }];
    assertEquals(canManageMembers(agencyOwner, TENANT_A, TENANT_A), false);
    assertEquals(canManageMembers(campaigner, TENANT_A, TENANT_A), false);
  });

  await t.step("a super admin manages only the tenant it acts in", () => {
    assertEquals(canManageMembers(superAdmin, TENANT_A, TENANT_A), true);
    assertEquals(canManageMembers(superAdmin, TENANT_A, TENANT_B), false);
    assertEquals(canManageMembers(superAdmin, TENANT_A, null), false);
  });

  await t.step("a tenant-scoped super_admin row is no super admin", () => {
    const scoped = [{ role: "super_admin", tenant_id: TENANT_A }];
    assertEquals(canManageMembers(scoped, TENANT_A, TENANT_A), false);
  });
});
