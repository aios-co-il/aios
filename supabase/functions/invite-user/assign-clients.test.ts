import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  assignInvitedClients,
  type ClientAssignmentStore,
  supabaseClientAssignmentStore,
} from "./assign-clients.ts";

/** In-memory store: clients by tenant and the existing client_team rows. */
function fakeStore(
  clientsByTenant: Record<string, Array<string>>,
  team: Array<{ client_id: string; campaigner_id: string }>,
  cardsByTenant: Record<string, Array<string>> = { t1: ["card"] },
): ClientAssignmentStore & { team: typeof team } {
  return {
    team,
    campaignerInTenant: (tenantId, campaignerId) =>
      Promise.resolve((cardsByTenant[tenantId] ?? []).includes(campaignerId)),
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

Deno.test(
  "rejects a campaigner card from another tenant before writing",
  async () => {
    const store = fakeStore({ t1: ["c1"] }, [], { t2: ["foreign-card"] });

    await assertRejects(
      () =>
        assignInvitedClients(store, {
          tenantId: "t1",
          campaignerId: "foreign-card",
          clientIds: ["c1"],
        }),
      Error,
      "Campaigner is not in this organization",
    );
    assertEquals(store.team, []);
  },
);

/** A Supabase client stand-in that records each query's calls and answers with `rows`. */
function recordingDb(rows: Array<Record<string, unknown>>) {
  const calls: Array<[string, ...Array<unknown>]> = [];
  const result = Promise.resolve({ data: rows, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "or", "upsert"]) {
    chain[method] = (...args: Array<unknown>) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = result.then.bind(result);
  const db = {
    from: (table: string) => {
      calls.push(["from", table]);
      return chain;
    },
  };
  return { db, calls };
}

Deno.test("the store counts only assignments active today", async () => {
  const { db, calls } = recordingDb([{ client_id: "c1" }]);
  const store = supabaseClientAssignmentStore(
    db as unknown as Parameters<typeof supabaseClientAssignmentStore>[0],
  );

  await store.assignedClientIds("card", ["c1"]);

  const today = new Date().toISOString().slice(0, 10);
  assertEquals(
    calls.filter(([method]) => method === "or"),
    [
      ["or", `start_date.is.null,start_date.lte.${today}`],
      ["or", `end_date.is.null,end_date.gte.${today}`],
    ],
  );
});

Deno.test(
  "the store writes a start date and lets the unique key drop duplicates",
  async () => {
    const { db, calls } = recordingDb([]);
    const store = supabaseClientAssignmentStore(
      db as unknown as Parameters<typeof supabaseClientAssignmentStore>[0],
    );

    await store.insertAssignments([{ client_id: "c1", campaigner_id: "card" }]);

    const today = new Date().toISOString().slice(0, 10);
    assertEquals(calls, [
      ["from", "client_team"],
      [
        "upsert",
        [{ client_id: "c1", campaigner_id: "card", start_date: today }],
        {
          onConflict: "client_id,campaigner_id,start_date",
          ignoreDuplicates: true,
        },
      ],
    ]);
  },
);
