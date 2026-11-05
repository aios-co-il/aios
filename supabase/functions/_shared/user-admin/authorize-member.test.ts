import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { authorizeMemberChange } from "./authorize-member.ts";
import { MemberAdminError, type MemberRequest } from "./member-admin.ts";
import {
  ADMIN,
  CO_OWNER,
  fakeStore,
  MEMBER,
  OTHER_OWNER,
  OWNER,
  TENANT_A,
  TENANT_B,
  world,
} from "./member-admin-fake.ts";

const asOwner = "Bearer owner-token";
const memberOfA: MemberRequest = { userId: MEMBER, tenantId: TENANT_A };

/** Asserts the check refuses with `status`, before any write. */
async function refuses(
  status: number,
  authorization: string | null,
  body: MemberRequest,
  edit: (w: ReturnType<typeof world>) => void = () => {},
) {
  const w = world();
  edit(w);
  const { store, writes } = fakeStore(w);
  const error = await assertRejects(
    () => authorizeMemberChange(store, authorization, body),
    MemberAdminError,
  );
  assertEquals(error.status, status);
  assertEquals(writes, []);
}

Deno.test("authorizeMemberChange", async (t) => {
  await t.step(
    "the owner may change another member of its tenant",
    async () => {
      const { store } = fakeStore(world());
      const target = await authorizeMemberChange(store, asOwner, memberOfA);
      assertEquals(target, {
        callerId: OWNER,
        tenantId: TENANT_A,
        targetId: MEMBER,
        membership: "active",
      });
    },
  );

  await t.step("a super admin acting in the tenant may", async () => {
    const { store } = fakeStore(world());
    const target = await authorizeMemberChange(
      store,
      "Bearer admin-token",
      memberOfA,
    );
    assertEquals(target.callerId, ADMIN);
  });

  await t.step("an email names the target", async () => {
    const { store } = fakeStore(world());
    const target = await authorizeMemberChange(store, asOwner, {
      email: " Member@Example.invalid ",
      tenantId: TENANT_A,
    });
    assertEquals(target.targetId, MEMBER);
  });

  await t.step("no or an unknown token is 401", async () => {
    await refuses(401, null, memberOfA);
    await refuses(401, "Bearer nobody", memberOfA);
  });

  await t.step("a missing tenant or target is 400", async () => {
    await refuses(400, asOwner, { userId: MEMBER });
    await refuses(400, asOwner, { tenantId: TENANT_A });
  });

  await t.step("an unknown email is the same 404 as a non-member", async () => {
    await refuses(404, asOwner, {
      email: "nobody@example.invalid",
      tenantId: TENANT_A,
    });
  });

  await t.step(
    "an unauthorised caller learns nothing about an email",
    async () => {
      const w = world();
      let looked = false;
      const { store } = fakeStore(w);
      store.userIdByEmail = async () => {
        looked = true;
        return MEMBER;
      };
      const error = await assertRejects(
        () =>
          authorizeMemberChange(store, "Bearer other-owner-token", {
            email: "member@example.invalid",
            tenantId: TENANT_A,
          }),
        MemberAdminError,
      );
      assertEquals(error.status, 403);
      assertEquals(looked, false);
    },
  );

  await t.step("the caller themself is 409", async () => {
    await refuses(409, asOwner, { userId: OWNER, tenantId: TENANT_A });
  });

  await t.step(
    "a member, another tenant's owner, or an agency owner is 403",
    async () => {
      await refuses(403, "Bearer member-token", {
        userId: OWNER,
        tenantId: TENANT_A,
      });
      await refuses(403, "Bearer other-owner-token", memberOfA);
      await refuses(403, asOwner, memberOfA, (w) => {
        w.roles[OWNER] = [{ role: "agency_owner", tenant_id: TENANT_A }];
      });
    },
  );

  await t.step("a super admin acting in another tenant is 403", async () => {
    await refuses(403, "Bearer admin-token", memberOfA, (w) => {
      w.activeTenant[ADMIN] = TENANT_B;
    });
  });

  await t.step("a super admin target is 409", async () => {
    await refuses(409, asOwner, { userId: ADMIN, tenantId: TENANT_A }, (w) => {
      w.memberships[`${TENANT_A}:${ADMIN}`] = "active";
    });
  });

  await t.step("a non-member or a missing login is 404", async () => {
    await refuses(404, asOwner, { userId: OTHER_OWNER, tenantId: TENANT_A });
    await refuses(404, asOwner, memberOfA, (w) => w.logins.delete(MEMBER));
  });
});

Deno.test("a super admin who also owns the organization", async (t) => {
  /** The super admin also holds an owner role in A and acts in `active`. */
  const owningAdmin = (active: string) =>
    fakeStore({
      ...world(),
      roles: {
        ...world().roles,
        [ADMIN]: [
          { role: "super_admin", tenant_id: null },
          { role: "owner", tenant_id: TENANT_A },
        ],
      },
      memberships: {
        ...world().memberships,
        [`${TENANT_A}:${ADMIN}`]: "active",
      },
      activeTenant: { ...world().activeTenant, [ADMIN]: active },
    }).store;
  const coOwner = { userId: CO_OWNER, tenantId: TENANT_A };

  await t.step(
    "acting in B, is only an owner of A: a co-owner is refused",
    async () => {
      const error = await assertRejects(
        () =>
          authorizeMemberChange(
            owningAdmin(TENANT_B),
            "Bearer admin-token",
            coOwner,
          ),
        MemberAdminError,
      );
      assertEquals(error.status, 403);
    },
  );

  await t.step("acting in A, may change the co-owner", async () => {
    const target = await authorizeMemberChange(
      owningAdmin(TENANT_A),
      "Bearer admin-token",
      coOwner,
    );
    assertEquals(target.targetId, CO_OWNER);
  });
});
