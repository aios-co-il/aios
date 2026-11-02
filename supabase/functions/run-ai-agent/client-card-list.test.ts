import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { listClientCardEntries, mapClientCardRow } from "./client-card-list.ts";

// DMM shares agency X with org B and agency Y with org C; CLIENT is a DMM
// client in agency Y, so org B shares DMM's tenant but not this client.
const DMM = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";
const ORG_C = "55555555-5555-4555-8555-555555555555";
const AGENCY_X = "66666666-6666-4666-8666-666666666666";
const AGENCY_Y = "77777777-7777-4777-8777-777777777777";
const UNRELATED_ORG = "88888888-8888-4888-8888-888888888888";

type Row = Record<string, unknown>;

type Tables = Record<string, Row[]>;

const SHARES = [
  {
    id: "ata-b",
    accessing_tenant_id: ORG_B,
    source_tenant_id: DMM,
    agency_id: AGENCY_X,
  },
  {
    id: "ata-c",
    accessing_tenant_id: ORG_C,
    source_tenant_id: DMM,
    agency_id: AGENCY_Y,
  },
];

const TABLES: Tables = {
  clients: [{ id: CLIENT, tenant_id: DMM, agency_id: AGENCY_Y }],
  agency_tenant_access: SHARES,
  client_updates: [
    {
      id: "dmm-row",
      client_id: CLIENT,
      tenant_id: DMM,
      content: "בוצעה שיחה",
      created_at: "2026-10-26T08:00:00Z",
      update_type: "call",
      source: "human",
      profiles: { full_name: "דנה" },
    },
    { id: "c-row", client_id: CLIENT, tenant_id: ORG_C, source: "carmen" },
    {
      id: "other-client-row",
      client_id: OTHER_CLIENT,
      tenant_id: DMM,
      source: "human",
    },
  ],
};

Deno.test("mapClientCardRow", async (t) => {
  await t.step("names the author and labels the source", () => {
    assertEquals(
      mapClientCardRow({
        id: "u1",
        content: "שיחה",
        created_at: "2026-10-26T08:00:00Z",
        update_type: "call",
        source: "carmen_confirmed",
        counts_as_contact: true,
        profiles: { full_name: " דנה ", email: "dana@example.com" },
      }),
      {
        id: "u1",
        content: "שיחה",
        created_at: "2026-10-26T08:00:00Z",
        update_type: "call",
        source: "carmen_confirmed",
        source_label: "כרמן",
        author: "דנה",
        counts_as_contact: true,
      },
    );
  });

  await t.step("reads a legacy row as a human entry", () => {
    const legacy = mapClientCardRow({
      id: "u2",
      content: "הערה",
      created_at: "2026-10-01T08:00:00Z",
      profiles: [{ full_name: "", email: "owner@example.com" }],
    });
    assertStrictEquals(legacy.source, "human");
    assertStrictEquals(legacy.source_label, "צוות");
    assertStrictEquals(legacy.author, "owner@example.com");
    assertStrictEquals(legacy.update_type, null);
    assertStrictEquals(legacy.counts_as_contact, null);
  });
});

Deno.test("listClientCardEntries", async (t) => {
  await t.step(
    "caps the limit and shapes author, type and source",
    async () => {
      const { result, log } = await listAs(DMM, { limit: 500 });
      assert("updates" in result);
      assertStrictEquals(result.updates[0].author, "דנה");
      assertStrictEquals(result.updates[0].update_type, "call");
      assertStrictEquals(result.updates[0].source, "human");
      const limit = log.find(
        (entry) => entry.table === "client_updates" && entry.op === "limit",
      );
      assertEquals(limit?.args, [100]);
    },
  );

  await t.step(
    "one shared card: the client's org also sees entries the sharing org wrote",
    async () => {
      const { result, log } = await listAs(DMM);
      assert("updates" in result);
      assertEquals(
        result.updates.map((update) => update.id),
        ["dmm-row", "c-row"],
      );
      const tenantFilters = log.filter(
        (entry) => entry.op === "in" && entry.args[0] === "tenant_id",
      );
      assertEquals(
        tenantFilters.map((entry) => entry.table),
        ["clients"],
      );
    },
  );

  await t.step(
    "the org the client's agency is shared with reads the same card",
    async () => {
      const { result } = await listAs(ORG_C);
      assert("updates" in result);
      assertEquals(
        result.updates.map((update) => update.id),
        ["dmm-row", "c-row"],
      );
    },
  );

  await t.step(
    "an org sharing only another agency of the client's tenant gets not_found",
    async () => {
      const { result, log } = await listAs(ORG_B);
      assert("error" in result);
      assertStrictEquals(result.error, "not_found");
      assertStrictEquals(
        log.some((entry) => entry.table === "client_updates"),
        false,
      );
    },
  );

  await t.step(
    "a client outside the caller's tenants is not_found",
    async () => {
      const { result, log } = await listAs(UNRELATED_ORG);
      assert("error" in result);
      assertStrictEquals(result.error, "not_found");
      assertStrictEquals(
        log.some((entry) => entry.table === "client_updates"),
        false,
      );
    },
  );

  await t.step("a failed agency access lookup throws", async () => {
    await assertRejects(() =>
      listAs(ORG_C, {
        errors: { agency_tenant_access: { message: "boom" } },
      }),
    );
  });

  await t.step(
    "the agent hint names every automatic source and no human one",
    async () => {
      const { result } = await listAs(DMM);
      assert("instructions_to_agent" in result);
      assertStrictEquals(
        result.instructions_to_agent,
        "author הוא האדם שהעדכון משויך אליו. כש-source הוא carmen, system_send, group_digest או automation — העדכון נכתב אוטומטית ולא על ידי אותו אדם. carmen_confirmed הוא עדכון שרשמת לבקשתו.",
      );
    },
  );
});

/**
 * list_updates on CLIENT for a caller in `tenantId`, whose accessible tenants
 * are built as getAccessibleTenantIds does: its own tenant plus the source
 * tenant of every agency shared with it.
 */
async function listAs(
  tenantId: string,
  opts: { limit?: unknown; errors?: Record<string, { message: string }> } = {},
) {
  const accessibleTenantIds = [
    tenantId,
    ...SHARES.filter((share) => share.accessing_tenant_id === tenantId).map(
      (share) => share.source_tenant_id,
    ),
  ];
  const { supabase, log } = fakeTables(TABLES, opts.errors ?? {});
  const result = await listClientCardEntries(supabase, {
    clientId: CLIENT,
    tenantId,
    accessibleTenantIds,
    limit: opts.limit,
  });
  return { result, log };
}

/**
 * A from() stand-in over in-memory tables: eq/in filter the table's rows,
 * maybeSingle returns the first match and awaiting the chain returns every
 * match. A table listed in `errors` fails instead.
 */
function fakeTables(
  tables: Tables,
  errors: Record<string, { message: string }>,
) {
  const log: Array<{ table: string; op: string; args: unknown[] }> = [];
  const builder = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const matches = () =>
      (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "order", "limit"]) {
      chain[op] = (...args: unknown[]) => {
        log.push({ table, op, args });
        return chain;
      };
    }
    chain.eq = (column: string, value: unknown) => {
      log.push({ table, op: "eq", args: [column, value] });
      filters.push((row) => row[column] === value);
      return chain;
    };
    chain.in = (column: string, values: unknown[]) => {
      log.push({ table, op: "in", args: [column, values] });
      filters.push((row) => values.includes(row[column]));
      return chain;
    };
    chain.maybeSingle = async () =>
      errors[table]
        ? { data: null, error: errors[table] }
        : { data: matches()[0] ?? null, error: null };
    chain.then = (resolve: (result: { data: Row[]; error: null }) => void) =>
      resolve({ data: matches(), error: null });
    return chain;
  };
  return { supabase: { from: builder }, log };
}
