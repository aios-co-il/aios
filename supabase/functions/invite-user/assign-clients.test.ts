import { assertEquals } from "jsr:@std/assert@1";
import {
  assignInvitedClients,
  type ClientAssignmentStore,
} from "./assign-clients.ts";

/** In-memory store: clients by tenant and the existing client_team rows. */
function fakeStore(
  clientsByTenant: Record<string, Array<string>>,
  team: Array<{ client_id: string; campaigner_id: string }>,
): ClientAssignmentStore & { team: typeof team } {
  return {
    team,
    tenantClientIds: (tenantId, ids) =>
      Promise.resolve(
        ids.filter((id) => (clientsByTenant[tenantId] ?? []).includes(id)),
      ),
    assignedClientIds: (campaignerId, ids) =>
      Promise.resolve(
        team
          .filter(
            (row) =>
              row.campaigner_id === campaignerId && ids.includes(row.client_id),
          )
          .map((row) => row.client_id),
      ),
    insertAssignments: (rows) => {
      team.push(...rows);
      return Promise.resolve();
    },
  };
}

Deno.test(
  "puts the invited campaigner on the chosen clients' teams",
  async () => {
    const store = fakeStore({ t1: ["c1", "c2"] }, []);

    const result = await assignInvitedClients(store, {
      tenantId: "t1",
      campaignerId: "card",
      clientIds: ["c1", "c2"],
    });

    assertEquals(result.assigned, ["c1", "c2"]);
    assertEquals(store.team, [
      { client_id: "c1", campaigner_id: "card" },
      { client_id: "c2", campaigner_id: "card" },
    ]);
  },
);

Deno.test("never assigns a client of another tenant", async () => {
  const store = fakeStore({ t1: ["c1"], t2: ["foreign"] }, []);

  const result = await assignInvitedClients(store, {
    tenantId: "t1",
    campaignerId: "card",
    clientIds: ["c1", "foreign"],
  });

  assertEquals(result.outsideTenant, ["foreign"]);
  assertEquals(store.team, [{ client_id: "c1", campaigner_id: "card" }]);
});

Deno.test(
  "skips clients the card is already on, and duplicates in the request",
  async () => {
    const store = fakeStore({ t1: ["c1", "c2"] }, [
      { client_id: "c1", campaigner_id: "card" },
    ]);

    const result = await assignInvitedClients(store, {
      tenantId: "t1",
      campaignerId: "card",
      clientIds: ["c1", "c2", "c2"],
    });

    assertEquals(result.alreadyAssigned, ["c1"]);
    assertEquals(result.assigned, ["c2"]);
    assertEquals(store.team.length, 2);
  },
);

Deno.test("does nothing without a campaigner card", async () => {
  const store = fakeStore({ t1: ["c1"] }, []);

  const result = await assignInvitedClients(store, {
    tenantId: "t1",
    campaignerId: undefined,
    clientIds: ["c1"],
  });

  assertEquals(result.assigned, []);
  assertEquals(store.team, []);
});
