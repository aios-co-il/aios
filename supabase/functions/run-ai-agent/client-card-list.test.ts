import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { listClientCardEntries, mapClientCardRow } from "./client-card-list.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const SHARING_TENANT = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";

Deno.test("mapClientCardRow names the author and labels the source", () => {
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

/**
 * A from() stand-in: the clients lookup finds the client or not, and the
 * client_updates query applies its eq/in filters to the given rows.
 */
function fakeListSupabase(
  clientFound: boolean,
  rows: Record<string, unknown>[],
) {
  const log: Array<{ table: string; op: string; args: unknown[] }> = [];
  const builder = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
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
    chain.maybeSingle = async () => ({
      data: clientFound ? { id: CLIENT } : null,
      error: null,
    });
    chain.then = (resolve: (result: { data: unknown; error: null }) => void) =>
      resolve({
        data: rows.filter((row) => filters.every((keep) => keep(row))),
        error: null,
      });
    return chain;
  };
  return { supabase: { from: builder }, log };
}

Deno.test(
  "list_updates: capped and shaped with author, type and source",
  async () => {
    const { supabase, log } = fakeListSupabase(true, [
      {
        id: "u1",
        client_id: CLIENT,
        tenant_id: TENANT,
        content: "בוצעה שיחה",
        created_at: "2026-10-26T08:00:00Z",
        update_type: "call",
        source: "human",
        profiles: { full_name: "דנה" },
      },
    ]);
    const result = await listClientCardEntries(supabase, {
      clientId: CLIENT,
      accessibleTenantIds: [TENANT],
      limit: 500,
    });
    assert("updates" in result);
    assertStrictEquals(result.count, 1);
    assertStrictEquals(result.updates[0].author, "דנה");
    assertStrictEquals(result.updates[0].update_type, "call");
    assertStrictEquals(result.updates[0].source, "human");
    const limit = log.find((entry) => entry.op === "limit");
    assertEquals(limit?.args, [100]);
  },
);

Deno.test(
  "list_updates: one shared card — the client's org also sees entries the sharing org wrote",
  async () => {
    const { supabase, log } = fakeListSupabase(true, [
      { id: "dmm-row", client_id: CLIENT, tenant_id: TENANT, source: "human" },
      {
        id: "mc-row",
        client_id: CLIENT,
        tenant_id: SHARING_TENANT,
        source: "carmen",
      },
      {
        id: "other-client-row",
        client_id: OTHER_CLIENT,
        tenant_id: TENANT,
        source: "human",
      },
    ]);
    const result = await listClientCardEntries(supabase, {
      clientId: CLIENT,
      accessibleTenantIds: [TENANT],
    });
    assert("updates" in result);
    assertEquals(
      result.updates.map((update) => update.id),
      ["dmm-row", "mc-row"],
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

Deno.test(
  "list_updates: a client outside the tenant returns not_found",
  async () => {
    const { supabase, log } = fakeListSupabase(false, []);
    const result = await listClientCardEntries(supabase, {
      clientId: CLIENT,
      accessibleTenantIds: [TENANT],
    });
    assert("error" in result);
    assertStrictEquals(result.error, "not_found");
    assertStrictEquals(
      log.some((entry) => entry.table === "client_updates"),
      false,
    );
  },
);

Deno.test(
  "list_updates: the agent hint names every automatic source and no human one",
  async () => {
    const { supabase } = fakeListSupabase(true, []);
    const result = await listClientCardEntries(supabase, {
      clientId: CLIENT,
      accessibleTenantIds: [TENANT],
    });
    assert("instructions_to_agent" in result);
    assertStrictEquals(
      result.instructions_to_agent,
      "author הוא האדם שהעדכון משויך אליו. כש-source הוא carmen, system_send, group_digest או automation — העדכון נכתב אוטומטית ולא על ידי אותו אדם. carmen_confirmed הוא עדכון שרשמת לבקשתו.",
    );
  },
);
