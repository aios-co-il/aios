import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { MemberAdminError } from "../_shared/user-admin/member-admin.ts";
import {
  fakeStore,
  MEMBER,
  OWNER,
  TENANT_A,
  world,
} from "../_shared/user-admin/member-admin-fake.ts";
import { deleteMember } from "./delete-member.ts";

const asOwner = "Bearer owner-token";
const body = { userId: MEMBER, tenantId: TENANT_A };

Deno.test("deleteMember", async (t) => {
  await t.step(
    "the last organization: offboard, then soft-delete the login",
    async () => {
      const w = world();
      w.offboard = { remainingTenants: 0, accountDeleted: true };
      const { store, writes } = fakeStore(w);
      const result = await deleteMember(store, asOwner, body);
      assertEquals(writes, [
        `offboard ${TENANT_A} ${MEMBER} by ${OWNER} deleted`,
        `login soft-deleted ${MEMBER}`,
      ]);
      assertEquals(result.accountDeleted, true);
      assertEquals(result.removedFromTenantOnly, false);
    },
  );

  await t.step("another organization left: the login stays", async () => {
    const w = world();
    w.offboard = { remainingTenants: 1, accountDeleted: false };
    const { store, writes } = fakeStore(w);
    const result = await deleteMember(store, asOwner, body);
    assertEquals(writes, [
      `offboard ${TENANT_A} ${MEMBER} by ${OWNER} deleted`,
    ]);
    assertEquals(result.removedFromTenantOnly, true);
  });

  await t.step("a refused check changes nothing", async () => {
    const { store, writes } = fakeStore(world());
    const error = await assertRejects(
      () =>
        deleteMember(store, "Bearer member-token", {
          userId: OWNER,
          tenantId: TENANT_A,
        }),
      MemberAdminError,
    );
    assertEquals(error.status, 403);
    assertEquals(writes, []);
  });

  await t.step("a rule the database refuses keeps the login", async () => {
    const w = world();
    w.offboard = new MemberAdminError(409, "the last owner of tenant");
    const { store, writes } = fakeStore(w);
    const error = await assertRejects(
      () => deleteMember(store, asOwner, body),
      MemberAdminError,
    );
    assertEquals(error.status, 409);
    assertEquals(writes, [
      `offboard ${TENANT_A} ${MEMBER} by ${OWNER} deleted`,
    ]);
  });

  await t.step(
    "a failed login removal is loud and says how to finish",
    async () => {
      const w = world();
      w.offboard = { remainingTenants: 0, accountDeleted: true };
      w.failSoftDelete = new Error("auth unavailable");
      const { store } = fakeStore(w);
      const error = await assertRejects(
        () => deleteMember(store, asOwner, body),
        MemberAdminError,
      );
      assertEquals(error.status, 502);
      assertEquals(error.message.includes("auth unavailable"), true);
      assertEquals(error.message.includes("Delete again"), true);
    },
  );

  await t.step(
    "a retry on a deleted member finishes the login removal",
    async () => {
      const w = world();
      w.memberships[`${TENANT_A}:${MEMBER}`] = "deleted";
      w.offboard = { remainingTenants: 0, accountDeleted: true };
      const { store, writes } = fakeStore(w);
      await deleteMember(store, asOwner, body);
      assertEquals(writes.at(-1), `login soft-deleted ${MEMBER}`);
    },
  );
});
