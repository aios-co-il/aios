import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fakeDb } from "../_shared/carmen/brain-connections/fake-db.ts";
import { requireManager } from "./auth.ts";
import {
  CLIENT,
  DMM,
  DMM_OWNER,
  homeWorld,
  MC,
  MC_OWNER,
  SUPER_ADMIN,
} from "./fake-orgs.ts";
import { HttpError } from "./request.ts";

// Who may manage, share and unshare a tenant's brains (AIO-354): its owners,
// and a super admin only in the tenant they act in (TENANT_ISOLATION.md).
Deno.test("requireManager", async (t) => {
  await t.step(
    "the super admin acting in MarketingCaptain manages it",
    async () => {
      const sb = fakeDb(homeWorld());
      assertEquals(await requireManager(sb, SUPER_ADMIN, MC), {
        superAdminActing: true,
      });
    },
  );

  await t.step(
    "the super admin is refused in a tenant they do not act in",
    async () => {
      const sb = fakeDb(homeWorld());
      await assertRejects(
        () => requireManager(sb, SUPER_ADMIN, CLIENT),
        HttpError,
        "Only tenant owners",
      );
    },
  );

  await t.step(
    "acting elsewhere, the super admin manages MarketingCaptain only as its owner",
    async () => {
      const world = homeWorld();
      world.acting = { [SUPER_ADMIN]: DMM };
      assertEquals(await requireManager(fakeDb(world), SUPER_ADMIN, MC), {
        superAdminActing: false,
      });
    },
  );

  await t.step("MarketingCaptain's owner manages it", async () => {
    const sb = fakeDb(homeWorld());
    assertEquals(await requireManager(sb, MC_OWNER, MC), {
      superAdminActing: false,
    });
  });

  await t.step("a member or another org's owner is refused", async () => {
    const sb = fakeDb(homeWorld());
    await assertRejects(() => requireManager(sb, MC_OWNER, CLIENT), HttpError);
    await assertRejects(() => requireManager(sb, DMM_OWNER, MC), HttpError);
  });
});
