import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../database.types.ts";
import { fakeClient, type FakeDb } from "./tests/fake-postgrest.ts";

/** Real SDK queries over the existing in-memory records, without network access. */
export function recordsClient(db: FakeDb) {
  return createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(new Request(input, init).url);
        const query = fakeClient(db).from("crm_records").select();
        for (const [column, filter] of url.searchParams) {
          if (column === "or") {
            query.or(filter.slice(1, -1));
          } else if (column === "order") {
            query.order(filter.split(".")[0]);
          } else if (!["select", "offset", "limit"].includes(column)) {
            const dot = filter.indexOf(".");
            const op = filter.slice(0, dot);
            const value = filter.slice(dot + 1);
            if (op === "eq") {
              query.eq(column, value);
            } else if (op === "in") {
              query.in(column, value.slice(1, -1).split(","));
            } else if (op === "gte") {
              query.gte(column, value);
            } else if (op === "lte") {
              query.lte(column, value);
            } else {
              throw new Error(`Unexpected records filter: ${filter}`);
            }
          }
        }
        const from = Number(url.searchParams.get("offset") || 0);
        const size = Number(url.searchParams.get("limit") || 1000);
        const { data, error } = await query.range(from, from + size - 1);
        return new Response(JSON.stringify(error || data), {
          status: error ? 400 : 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}
