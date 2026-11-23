import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  type ExistingUserStore,
  joinExistingUser,
  type TeamLinks,
} from "./join-existing-user.ts";

interface FakeProfile {
  status: string;
  full_name: string | null;
  campaigner_id?: string;
  sales_person_id?: string;
}

/** In-memory profile, memberships and permissions for one user. */
function fakeStore(
  profile: FakeProfile | null,
  tenants: Array<string>,
  permissions: Array<string>,
): ExistingUserStore & {
  profile: () => FakeProfile | null;
  permissions: Array<string>;
} {
  let current = profile;
  return {
    profile: () => current,
    permissions,
    belongsToOtherTenant: (_userId, tenantId) =>
      Promise.resolve(tenants.some((id) => id !== tenantId)),
    ensureProfile: () => {
      current ??= { status: "pending", full_name: null };
      return Promise.resolve();
    },
    fillMissingName: (_userId, fullName) => {
      if (current && !current.full_name) {
        current.full_name = fullName;
      }
      return Promise.resolve();
    },
    setTeamLinks: (_userId, links: TeamLinks) => {
      if (current) {
        Object.assign(current, links);
      }
      return Promise.resolve();
    },
    replacePermissions: (_userId, modules) => {
      permissions.splice(0, permissions.length, ...modules);
      return Promise.resolve();
    },
    addPermissions: (_userId, modules) => {
      permissions.push(...modules.filter((m) => !permissions.includes(m)));
      return Promise.resolve();
    },
  };
}

const joinB = {
  userId: "u1",
  email: "u1@example.com",
  tenantId: "B",
  fullName: "New Name",
  teamLinks: { campaigner_id: "card-B" },
  modulePermissions: ["clients", "tasks"],
};

describe("joinExistingUser", () => {
  it("a user active in A who joins B keeps status, name, card link and A's permissions", async () => {
    const store = fakeStore(
      { status: "active", full_name: "Yuval", campaigner_id: "card-A" },
      ["A"],
      ["leads", "clients"],
    );

    await joinExistingUser(store, joinB);

    assertEquals(store.profile(), {
      status: "active",
      full_name: "Yuval",
      campaigner_id: "card-A",
    });
    assertEquals(store.permissions, ["leads", "clients", "tasks"]);
  });

  it("a user in no other tenant gets B's card link and permissions", async () => {
    const store = fakeStore({ status: "active", full_name: "" }, [], ["leads"]);

    await joinExistingUser(store, joinB);

    assertEquals(store.profile(), {
      status: "active",
      full_name: "New Name",
      campaigner_id: "card-B",
    });
    assertEquals(store.permissions, ["clients", "tasks"]);
  });

  it("a user without a profile gets a pending one", async () => {
    const store = fakeStore(null, [], []);

    await joinExistingUser(store, { ...joinB, teamLinks: {} });

    assertEquals(store.profile(), { status: "pending", full_name: "New Name" });
  });

  it("no modules leaves existing permissions untouched", async () => {
    const store = fakeStore(
      { status: "active", full_name: "Y" },
      [],
      ["leads"],
    );

    await joinExistingUser(store, { ...joinB, modulePermissions: [] });

    assertEquals(store.permissions, ["leads"]);
  });
});
