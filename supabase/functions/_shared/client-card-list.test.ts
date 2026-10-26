import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { listClientCardEntries, mapClientCardRow } from "./client-card-list.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

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

function fakeListSupabase(clientFound: boolean, rows: any[]) {
  const log: Array<{ table: string; op: string; args: unknown[] }> = [];
  const builder = (table: string) => {
    const chain: any = {};
    for (const op of ["select", "eq", "in", "order", "limit"]) {
      chain[op] = (...args: unknown[]) => {
        log.push({ table, op, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => ({
      data: clientFound ? { id: CLIENT } : null,
      error: null,
    });
    chain.then = (resolve: any) => resolve({ data: rows, error: null });
    return chain;
  };
  return { supabase: { from: builder }, log };
}

Deno.test(
  "list_updates: tenant-scoped, capped and shaped with author, type and source",
  async () => {
    const { supabase, log } = fakeListSupabase(true, [
      {
        id: "u1",
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
    assertStrictEquals(result.count, 1);
    assertStrictEquals((result.updates as any[])[0].author, "דנה");
    assertStrictEquals((result.updates as any[])[0].update_type, "call");
    assertStrictEquals((result.updates as any[])[0].source, "human");
    const tenantFilters = log.filter(
      (entry) => entry.op === "in" && entry.args[0] === "tenant_id",
    );
    assertEquals(
      tenantFilters.map((entry) => entry.table),
      ["clients", "client_updates"],
    );
    const limit = log.find((entry) => entry.op === "limit");
    assertEquals(limit?.args, [100]);
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
    assertStrictEquals(result.error, "not_found");
    assertStrictEquals(
      log.some((entry) => entry.table === "client_updates"),
      false,
    );
  },
);
