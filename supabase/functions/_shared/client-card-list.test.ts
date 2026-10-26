import assert from "node:assert/strict";
import test from "node:test";

import { listClientCardEntries, mapClientCardRow } from "./client-card-list.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

test("mapClientCardRow names the author and labels the source", () => {
  assert.deepEqual(
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
  assert.equal(legacy.source, "human");
  assert.equal(legacy.source_label, "צוות");
  assert.equal(legacy.author, "owner@example.com");
  assert.equal(legacy.update_type, null);
  assert.equal(legacy.counts_as_contact, null);
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

test("list_updates: tenant-scoped, capped and shaped with author, type and source", async () => {
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
  assert.equal(result.count, 1);
  assert.equal((result.updates as any[])[0].author, "דנה");
  assert.equal((result.updates as any[])[0].update_type, "call");
  assert.equal((result.updates as any[])[0].source, "human");
  const tenantFilters = log.filter(
    (entry) => entry.op === "in" && entry.args[0] === "tenant_id",
  );
  assert.deepEqual(
    tenantFilters.map((entry) => entry.table),
    ["clients", "client_updates"],
  );
  const limit = log.find((entry) => entry.op === "limit");
  assert.deepEqual(limit?.args, [100]);
});

test("list_updates: a client outside the tenant returns not_found", async () => {
  const { supabase, log } = fakeListSupabase(false, []);
  const result = await listClientCardEntries(supabase, {
    clientId: CLIENT,
    accessibleTenantIds: [TENANT],
  });
  assert.equal(result.error, "not_found");
  assert.equal(
    log.some((entry) => entry.table === "client_updates"),
    false,
  );
});
