import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { MemberAdminError } from "../_shared/user-admin/member-admin.ts";
import {
  ADMIN,
  CO_OWNER,
  fakeStore,
  type FakeWorld,
  MEMBER,
  OWNER,
  TENANT_A,
  TENANT_B,
  world,
} from "../_shared/user-admin/member-admin-fake.ts";
import { setMemberActive } from "./set-member-active.ts";

const asOwner = "Bearer owner-token";
const deactivate = { userId: MEMBER, tenantId: TENANT_A, active: false };
const reactivate = { userId: MEMBER, tenantId: TENANT_A, active: true };

/** Asserts the call refuses with `status` and lists the writes it made. */
async function refuses(
  status: number,
  body: Record<string, unknown>,
  edit: (w: FakeWorld) => void = () => {},
): Promise<Array<string>> {
  const w = world();
  edit(w);
  const { store, writes } = fakeStore(w);
  const error = await assertRejects(
    () => setMemberActive(store, asOwner, body),
    MemberAdminError,
  );
  assertEquals(error.status, status);
  return writes;
}

Deno.test("setMemberActive", async (t) => {
  await t.step(
    "deactivating the last organization blocks sign-in",
    async () => {
      const { store, writes } = fakeStore(world());
      const result = await setMemberActive(store, asOwner, deactivate);
      assertEquals(writes, [
        `offboard ${TENANT_A} ${MEMBER} by ${OWNER} inactive`,
        `sign-in blocked ${MEMBER}`,
      ]);
      assertEquals(result, { active: false, signInBlocked: true });
    },
  );

  await t.step("with another organization left, sign-in stays", async () => {
    const w = world();
    w.offboard = { remainingTenants: 1, accountDeleted: false };
    const { store, writes } = fakeStore(w);
    const result = await setMemberActive(store, asOwner, deactivate);
    assertEquals(writes, [
      `offboard ${TENANT_A} ${MEMBER} by ${OWNER} inactive`,
    ]);
    assertEquals(result.signInBlocked, false);
  });

  await t.step("reactivating restores the member, then sign-in", async () => {
    const w = world();
    w.memberships[`${TENANT_A}:${MEMBER}`] = "inactive";
    const { store, writes } = fakeStore(w);
    const result = await setMemberActive(store, asOwner, reactivate);
    assertEquals(writes, [
      `reactivate ${TENANT_A} ${MEMBER} by ${OWNER}`,
      `sign-in allowed ${MEMBER}`,
    ]);
    assertEquals(result, { active: true, signInBlocked: false });
  });

  await t.step("active must be a boolean", async () => {
    assertEquals(await refuses(400, { ...deactivate, active: "no" }), []);
  });

  await t.step(
    "a retry on an inactive member with no organization left blocks sign-in again",
    async () => {
      const w = world();
      w.memberships[`${TENANT_A}:${MEMBER}`] = "inactive";
      const { store, writes } = fakeStore(w);
      const result = await setMemberActive(store, asOwner, deactivate);
      assertEquals(writes, [`sign-in blocked ${MEMBER}`]);
      assertEquals(result, { active: false, signInBlocked: true });
    },
  );

  await t.step(
    "a retry on an inactive member of another organization changes nothing",
    async () => {
      const w = world();
      w.memberships[`${TENANT_A}:${MEMBER}`] = "inactive";
      w.memberships[`${TENANT_B}:${MEMBER}`] = "active";
      const { store, writes } = fakeStore(w);
      // Only the super admin ranks above them in B too.
      const result = await setMemberActive(
        store,
        "Bearer admin-token",
        deactivate,
      );
      assertEquals(writes, []);
      assertEquals(result, { active: false, signInBlocked: false });
    },
  );

  await t.step(
    "a retry on an active member lifts the block again",
    async () => {
      const { store, writes } = fakeStore(world());
      const result = await setMemberActive(store, asOwner, reactivate);
      assertEquals(writes, [`sign-in allowed ${MEMBER}`]);
      assertEquals(result, { active: true, signInBlocked: false });
    },
  );

  await t.step(
    "a deleted member is neither deactivated nor reactivated",
    async () => {
      for (const body of [deactivate, reactivate]) {
        const writes = await refuses(409, body, (w) => {
          w.memberships[`${TENANT_A}:${MEMBER}`] = "deleted";
        });
        assertEquals(writes, []);
      }
    },
  );

  await t.step("a non-owner changes nothing", async () => {
    const w = world();
    const { store, writes } = fakeStore(w);
    const error = await assertRejects(
      () =>
        setMemberActive(store, "Bearer member-token", {
          ...deactivate,
          userId: OWNER,
        }),
      MemberAdminError,
    );
    assertEquals(error.status, 403);
    assertEquals(writes, []);
  });

  await t.step(
    "a failed sign-in block is loud and says how to finish",
    async () => {
      const w = world();
      w.failSignIn = new Error("auth unavailable");
      const { store } = fakeStore(w);
      const error = await assertRejects(
        () => setMemberActive(store, asOwner, deactivate),
        MemberAdminError,
      );
      assertEquals(error.status, 502);
      assertEquals(error.message.includes("sign-in was not blocked"), true);
    },
  );
});

Deno.test("setMemberActive ranks", async (t) => {
  await t.step("an owner cannot deactivate a co-owner", async () => {
    const writes = await refuses(403, { ...deactivate, userId: CO_OWNER });
    assertEquals(writes, []);
  });

  await t.step(
    "a super admin acting in the tenant deactivates an owner",
    async () => {
      const w = world();
      w.memberships[`${TENANT_A}:${OWNER}`] = "active";
      const { store, writes } = fakeStore(w);
      const result = await setMemberActive(store, "Bearer admin-token", {
        ...deactivate,
        userId: CO_OWNER,
      });
      assertEquals(writes, [
        `offboard ${TENANT_A} ${CO_OWNER} by ${ADMIN} inactive`,
        `sign-in blocked ${CO_OWNER}`,
      ]);
      assertEquals(result.active, false);
    },
  );

  await t.step("an owner cannot reactivate an inactive co-owner", async () => {
    const writes = await refuses(
      403,
      { ...reactivate, userId: CO_OWNER },
      (w) => {
        w.memberships[`${TENANT_A}:${CO_OWNER}`] = "inactive";
        w.roles[CO_OWNER] = [];
        w.formerRoles[`${TENANT_A}:${CO_OWNER}`] = ["owner", "owner"];
      },
    );
    assertEquals(writes, []);
  });

  await t.step(
    "the owner of a parent organization reactivates an owner of A",
    async () => {
      const w = world();
      w.memberships[`${TENANT_A}:${CO_OWNER}`] = "inactive";
      w.roles[CO_OWNER] = [];
      w.formerRoles[`${TENANT_A}:${CO_OWNER}`] = ["owner", "owner"];
      const { store, writes } = fakeStore(w);
      await setMemberActive(store, "Bearer parent-owner-token", {
        ...reactivate,
        userId: CO_OWNER,
      });
      assertEquals(
        writes[0].startsWith(`reactivate ${TENANT_A} ${CO_OWNER}`),
        true,
      );
    },
  );

  await t.step(
    "an owner of A cannot deactivate a member who also works in B",
    async () => {
      const writes = await refuses(403, deactivate, (w) => {
        w.memberships[`${TENANT_B}:${MEMBER}`] = "active";
      });
      assertEquals(writes, []);
    },
  );
});
