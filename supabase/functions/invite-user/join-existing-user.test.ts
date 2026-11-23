import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  type ExistingUserStore,
  joinExistingUser,
  supabaseExistingUserStore,
} from "./join-existing-user.ts";
import { recordingDb } from "./recording-db.test-fixture.ts";

type FakeProfile = Record<string, string | null>;

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
    setTeamLinks: (_userId, links) => {
      Object.assign(current ?? {}, links);
      return Promise.resolve();
    },
    grantPermissions: (_userId, modules, keepOthers) => {
      const kept = keepOthers ? permissions : [];
      permissions.splice(
        0,
        permissions.length,
        ...new Set([...kept, ...modules]),
      );
      return Promise.resolve();
    },
  };
}

/** Store backed by a recording client, for asserting the queries it sends. */
function recordingStore(rows: Array<Record<string, unknown>> = []) {
  const { db, calls } = recordingDb(rows);
  const store = supabaseExistingUserStore(
    db as unknown as Parameters<typeof supabaseExistingUserStore>[0],
  );
  return { store, calls };
}

const joinB = {
  userId: "u1",
  email: "u1@example.com",
  tenantId: "B",
  fullName: "New Name",
  campaignerId: "card-B",
  salesPersonId: undefined,
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

    await joinExistingUser(store, { ...joinB, campaignerId: undefined });

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

describe("supabaseExistingUserStore", () => {
  it("creates a profile without touching an existing one", async () => {
    const { store, calls } = recordingStore();

    await store.ensureProfile("u1", "u1@example.com");

    assertEquals(calls, [
      ["from", "profiles"],
      [
        "upsert",
        { id: "u1", email: "u1@example.com", status: "pending" },
        { onConflict: "id", ignoreDuplicates: true },
      ],
    ]);
  });

  it("sets the name only on a profile without one", async () => {
    const { store, calls } = recordingStore();

    await store.fillMissingName("u1", "New Name");

    assertEquals(calls.at(-1), ["or", "full_name.is.null,full_name.eq."]);
  });

  it("keeping others only adds modules the user lacks", async () => {
    const { store, calls } = recordingStore();

    await store.grantPermissions("u1", ["tasks"], true);

    assertEquals(calls, [
      ["from", "user_permissions"],
      [
        "upsert",
        [{ user_id: "u1", module: "tasks", can_access: true }],
        { onConflict: "user_id,module", ignoreDuplicates: true },
      ],
    ]);
  });

  it("replacing grants first, then revokes only the other modules", async () => {
    const { store, calls } = recordingStore([
      { module: "tasks" },
      { module: "leads" },
    ]);

    await store.grantPermissions("u1", ["tasks"], false);

    assertEquals(calls[1][0], "upsert");
    assertEquals(calls.slice(-3), [
      ["delete"],
      ["eq", "user_id", "u1"],
      ["in", "module", ["leads"]],
    ]);
  });
});
