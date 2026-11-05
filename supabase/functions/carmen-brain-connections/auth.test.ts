import { assertEquals } from "jsr:@std/assert@1";
import { isTenantManager } from "./auth.ts";
import { fakeDb } from "./fake-db.ts";
import {
  CLIENT,
  DMM_OWNER,
  homeWorld,
  MC,
  MC_OWNER,
  SUPER_ADMIN,
} from "./fake-orgs.ts";

// Who may share or unshare MarketingCaptain's brains (AIO-354): its owners and
// the super admin, never a member or another organization's owner.
Deno.test("isTenantManager", async (t) => {
  const world = homeWorld();
  world.tables.user_roles = [
    { user_id: SUPER_ADMIN, role: "super_admin", tenant_id: null },
  ];
  const sb = fakeDb(world);

  await t.step("the super admin manages MarketingCaptain", async () => {
    assertEquals(await isTenantManager(sb, SUPER_ADMIN, MC), true);
  });

  await t.step("MarketingCaptain's owner manages it", async () => {
    assertEquals(await isTenantManager(sb, MC_OWNER, MC), true);
  });

  await t.step("a member or another org's owner does not", async () => {
    assertEquals(await isTenantManager(sb, MC_OWNER, CLIENT), false);
    assertEquals(await isTenantManager(sb, DMM_OWNER, MC), false);
  });
});
