import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { ensureReportShare } from "./share.ts";

const TENANT = "tenant-dmm";
const OTHER = "tenant-other";
const TABLE = "table-1";
const SCHEDULE = {
  tenant_id: TENANT,
  target_type: "table",
  created_by: "user-creator",
};

type ShareRow = {
  tenant_id: string;
  table_id: string;
  share_token: string;
  is_active: boolean;
};

/**
 * A service-role client whose requests reach an in-memory table_shares, the
 * newest share first: eq filters apply to reads and updates, inserts are
 * added on top.
 */
function sharesClient(rows: ShareRow[]): DbClient {
  const fakeFetch: typeof fetch = async (input, init) => {
    const filters = eqFilters(new URL(String(input)));
    const matches = rows.filter((row) => matchesAll(row, filters));
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      for (const row of matches) {
        Object.assign(row, JSON.parse(String(init?.body)));
      }
      return reply([]);
    }
    if (method === "POST") {
      const row: ShareRow = JSON.parse(String(init?.body));
      rows.unshift({ ...row, is_active: true });
      return reply(row);
    }
    return reply(matches.slice(0, 1));
  };
  return createClient<Database>("http://db.test", "service-key", {
    global: { fetch: fakeFetch },
    auth: { persistSession: false },
  });
}

/** The request's column=eq.value filters. */
function eqFilters(url: URL): Array<[string, string]> {
  return [...url.searchParams]
    .filter(([, value]) => value.startsWith("eq."))
    .map(([column, value]) => [column, value.slice(3)]);
}

/** Whether the row passes every filter. */
function matchesAll(
  row: Record<string, unknown>,
  filters: Array<[string, string]>,
): boolean {
  return filters.every(([column, value]) => String(row[column]) === value);
}

/** A PostgREST JSON reply. */
function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** A share of the table. */
function share(tenantId: string, token: string, isActive: boolean): ShareRow {
  return {
    tenant_id: tenantId,
    table_id: TABLE,
    share_token: token,
    is_active: isActive,
  };
}

Deno.test("ensureReportShare", async (t) => {
  await t.step(
    "switches back on the schedule tenant's share, not another tenant's",
    async () => {
      const other = share(OTHER, "other-token", false);
      const own = share(TENANT, "own-token", false);
      const url = await ensureReportShare(
        sharesClient([other, own]),
        SCHEDULE,
        TABLE,
      );

      assertEquals(url, "https://aios.co.il/shared/table/own-token");
      assertEquals(own.is_active, true);
      assertEquals(other.is_active, false);
    },
  );

  await t.step(
    "creates a share for the schedule's tenant when only another tenant has one",
    async () => {
      const rows = [share(OTHER, "other-token", true)];
      const url = await ensureReportShare(sharesClient(rows), SCHEDULE, TABLE);

      assertEquals(rows.length, 2);
      assertEquals(rows[0].tenant_id, TENANT);
      assertEquals(
        url,
        `https://aios.co.il/shared/table/${rows[0].share_token}`,
      );
      assert(rows[0].share_token.startsWith("report-"));
    },
  );
});
