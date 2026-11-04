import { assertEquals } from "jsr:@std/assert@1";
import {
  ancestorsOf,
  canManageMembers,
  mayManageMember,
  outranksIn,
  type RankedUser,
} from "./member-rank.ts";

const P = "33333333-3333-4333-8333-333333333333";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const parents = new Map([[A, P]]);

const ownerOf = (tenant: string): RankedUser => ({
  roles: [{ role: "owner", tenant_id: tenant }],
  memberships: [{ tenant_id: tenant, role: "owner" }],
});
const memberOf = (...tenants: Array<string>): RankedUser => ({
  roles: tenants.map((t) => ({ role: "campaigner", tenant_id: t })),
  memberships: tenants.map((t) => ({ tenant_id: t, role: "member" })),
});
const superAdmin: RankedUser = {
  roles: [{ role: "super_admin", tenant_id: null }],
  memberships: [],
};

/** mayManageMember with the defaults most cases share. */
function may(
  actor: RankedUser,
  target: RankedUser,
  tenantId = A,
  actorActiveTenantId: string | null = A,
  targetWasOwner = false,
) {
  return mayManageMember({
    actorId: "actor",
    actor,
    actorActiveTenantId,
    targetId: "target",
    target,
    tenantId,
    parents,
    targetWasOwner,
  });
}

Deno.test("ancestorsOf", async (t) => {
  await t.step("walks up the parents and stops at a loop", () => {
    assertEquals(ancestorsOf(A, parents), [P]);
    assertEquals(ancestorsOf(P, parents), []);
    assertEquals(
      ancestorsOf(
        A,
        new Map([
          [A, B],
          [B, A],
        ]),
      ),
      [B, A],
    );
  });
});

Deno.test("canManageMembers", async (t) => {
  await t.step(
    "the owner, a parent's owner, or a super admin acting there",
    () => {
      assertEquals(canManageMembers(ownerOf(A), A, B, parents), true);
      assertEquals(canManageMembers(ownerOf(P), A, P, parents), true);
      assertEquals(canManageMembers(superAdmin, A, A, parents), true);
    },
  );

  await t.step(
    "not an owner elsewhere, a member, or a super admin acting elsewhere",
    () => {
      assertEquals(canManageMembers(ownerOf(B), A, B, parents), false);
      assertEquals(canManageMembers(memberOf(A), A, A, parents), false);
      assertEquals(canManageMembers(superAdmin, A, B, parents), false);
      assertEquals(canManageMembers(ownerOf(A), P, A, parents), false);
    },
  );
});

Deno.test("outranksIn", async (t) => {
  await t.step("an owner ranks above a member but not a co-owner", () => {
    assertEquals(outranksIn(ownerOf(A), memberOf(A), A, parents), true);
    assertEquals(outranksIn(ownerOf(A), ownerOf(A), A, parents), false);
    assertEquals(outranksIn(ownerOf(A), memberOf(A), A, parents, true), false);
  });

  await t.step(
    "a parent's owner ranks above the sub-organization's owner",
    () => {
      assertEquals(outranksIn(ownerOf(P), ownerOf(A), A, parents), true);
    },
  );

  await t.step(
    "nobody ranks above a super admin; a super admin above everyone else",
    () => {
      assertEquals(outranksIn(ownerOf(A), superAdmin, A, parents), false);
      assertEquals(outranksIn(superAdmin, superAdmin, A, parents), false);
      assertEquals(outranksIn(superAdmin, ownerOf(B), B, parents), true);
    },
  );
});

Deno.test("mayManageMember", async (t) => {
  await t.step("an owner manages its members, also ones who work in B", () => {
    assertEquals(may(ownerOf(A), memberOf(A)), true);
    assertEquals(may(ownerOf(A), memberOf(A, B)), true);
    assertEquals(may(ownerOf(A), memberOf(B), B, A), false);
  });

  await t.step(
    "an owner of A manages, in A, someone who is an owner in B",
    () => {
      const ownerInB: RankedUser = {
        roles: [
          { role: "campaigner", tenant_id: A },
          { role: "owner", tenant_id: B },
        ],
        memberships: [
          { tenant_id: A, role: "member" },
          { tenant_id: B, role: "owner" },
        ],
      };
      assertEquals(may(ownerOf(A), ownerInB), true);
      // An account-wide action needs the rank in every organization.
      assertEquals(
        ownerInB.memberships.every((m) =>
          outranksIn(ownerOf(A), ownerInB, m.tenant_id, parents),
        ),
        false,
      );
    },
  );

  await t.step("an owner cannot touch a co-owner", () => {
    assertEquals(may(ownerOf(A), ownerOf(A)), false);
  });

  await t.step(
    "a super admin acting in A manages A's owner, also one in B",
    () => {
      assertEquals(may(superAdmin, ownerOf(A)), true);
      assertEquals(may(superAdmin, memberOf(A, B)), true);
      assertEquals(may(superAdmin, ownerOf(A), A, B), false);
    },
  );

  await t.step("nobody manages themselves", () => {
    assertEquals(
      mayManageMember({
        actorId: "same",
        actor: superAdmin,
        actorActiveTenantId: A,
        targetId: "same",
        target: memberOf(A),
        tenantId: A,
        parents,
        targetWasOwner: false,
      }),
      false,
    );
  });
});
