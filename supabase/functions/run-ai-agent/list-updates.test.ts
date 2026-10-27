import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { listUpdates } from "./list-updates.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const LEAD = "55555555-5555-4555-8555-555555555555";

function fakeLeadSupabase(lead: {
  found: boolean;
  error?: { message: string };
}) {
  const log: Array<{ table: string; op: string; args: unknown[] }> = [];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "order", "limit"]) {
      chain[op] = (...args: unknown[]) => {
        log.push({ table, op, args });
        return chain;
      };
    }
    chain.maybeSingle = async () => ({
      data: lead.found ? { id: LEAD } : null,
      error: lead.error ?? null,
    });
    chain.then = (resolve: (result: { data: unknown; error: null }) => void) =>
      resolve({ data: [{ id: "lu1", content: "הערה" }], error: null });
    return chain;
  };
  return { supabase: { from: builder }, log };
}

Deno.test(
  "listUpdates: a lead inside the caller's tenants lists its updates",
  async () => {
    const { supabase, log } = fakeLeadSupabase({ found: true });
    const result = await listUpdates(supabase, {
      entityType: "lead",
      entityId: LEAD,
      accessibleTenantIds: [TENANT],
    });
    assertEquals(result, {
      count: 1,
      updates: [{ id: "lu1", content: "הערה" }],
    });
    const tenantFilter = log.find(
      (entry) => entry.table === "leads" && entry.op === "in",
    );
    assertEquals(tenantFilter?.args, ["tenant_id", [TENANT]]);
    const limit = log.find((entry) => entry.op === "limit");
    assertEquals(limit?.args, [10]);
  },
);

Deno.test(
  "listUpdates: a lead outside the caller's tenants is not_found",
  async () => {
    const { supabase, log } = fakeLeadSupabase({ found: false });
    const result = await listUpdates(supabase, {
      entityType: "lead",
      entityId: LEAD,
      accessibleTenantIds: [TENANT],
    });
    assertEquals(result, {
      error: "not_found",
      message: "הליד לא נמצא בארגון הזה",
    });
    assertStrictEquals(
      log.some((entry) => entry.table === "lead_updates"),
      false,
    );
  },
);

Deno.test("listUpdates: a failed lead lookup throws", async () => {
  const { supabase } = fakeLeadSupabase({
    found: false,
    error: { message: "boom" },
  });
  await assertRejects(() =>
    listUpdates(supabase, {
      entityType: "lead",
      entityId: LEAD,
      accessibleTenantIds: [TENANT],
    }),
  );
});
