import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  getReconciliationStatus,
  readAiosCampaignRows,
  saveReconcileRun,
} from "./reconcile-db.ts";

type Call = { method: string; args: unknown[] };

/** Minimal PostgREST-style builder: records calls and answers `range` from `pages`. */
function fakeDb(handlers: {
  pages?: Array<Array<Record<string, unknown>>>;
  rows?: Array<Record<string, unknown>>;
  inserts?: Array<{ table: string; rows: unknown }>;
}) {
  const calls: Call[] = [];
  let pageIndex = 0;
  const db = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      const builder: Record<string, unknown> = {};
      const chain =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      for (const m of [
        "select",
        "eq",
        "gte",
        "lte",
        "gt",
        "in",
        "or",
        "order",
        "limit",
        "not",
      ])
        builder[m] = chain(m);
      builder.range = (...args: unknown[]) => {
        calls.push({ method: "range", args });
        const data = handlers.pages?.[pageIndex++] || [];
        return Promise.resolve({ data, error: null });
      };
      builder.insert = (rows: unknown) => {
        handlers.inserts?.push({ table, rows });
        const result = Promise.resolve({ error: null }) as Promise<{
          error: null;
        }> &
          Record<string, unknown>;
        result.select = () => ({
          single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
        });
        return result;
      };
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: handlers.rows || [], error: null });
      return builder;
    },
  };
  return { db, calls };
}

const rec = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `r${i}`,
  data: {
    date: "2026-10-20",
    campaign_id: String(i),
    campaign_name: `C${i}`,
    spend: 1,
    ...extra,
  },
});

Deno.test(
  "stored rows are read page by page until a short page; legacy rows count as campaign",
  async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => rec(i));
    const page2 = [
      rec(3),
      rec(4, { entity_level: "campaign" }),
      // The filter should have kept these out; they are dropped if they slip through.
      rec(5, { entity_level: "ad" }),
    ];
    const page3 = [rec(6)];
    const { db, calls } = fakeDb({ pages: [page1, page2, page3] });
    const rows = await readAiosCampaignRows(
      db,
      "table-1",
      "2026-10-19",
      "2026-10-25",
      3,
    );
    assertEquals(
      rows.map((r) => r.campaign_id),
      ["0", "1", "2", "3", "4", "6"],
    );
    assertEquals(
      calls.filter((c) => c.method === "range").map((c) => c.args),
      [
        [0, 2],
        [3, 5],
        [6, 8],
      ],
    );
    const or = calls.find((c) => c.method === "or");
    assertEquals(or?.args, [
      "data->>entity_level.is.null,data->>entity_level.eq.campaign",
    ]);
    const order = calls.find((c) => c.method === "order");
    assertEquals(order?.args, ["id", { ascending: true }]);
  },
);

Deno.test("a run and its findings are stored together", async () => {
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const { db } = fakeDb({ inserts });
  const id = await saveReconcileRun(
    db,
    {
      tenant_id: "tenant-1",
      table_id: "table-1",
      client_id: "client-1",
      platform: "meta",
      started_at: "2026-10-26T01:30:00Z",
      finished_at: "2026-10-26T01:30:05Z",
      status: "mismatch",
      window_start: "2026-10-19",
      window_end: "2026-10-25",
      summary: {},
    },
    [
      {
        kind: "missing_day",
        campaign_id: null,
        date: "2026-10-21",
        metric: "spend",
        aios_value: 0,
        platform_value: 300,
        details: {},
      },
    ],
  );
  assertStrictEquals(id, "run-1");
  assertEquals(
    inserts.map((i) => i.table),
    ["reconcile_runs", "reconcile_findings"],
  );
  const finding = (inserts[1].rows as Array<Record<string, unknown>>)[0];
  assertEquals(
    [finding.run_id, finding.tenant_id, finding.table_id, finding.kind],
    ["run-1", "tenant-1", "table-1", "missing_day"],
  );
});

Deno.test(
  "status keeps the latest run per table and puts gaps first",
  async () => {
    const run = (
      id: string,
      table_id: string | null,
      status: string,
      started_at: string,
    ) => ({
      id,
      tenant_id: "tenant-1",
      client_id: "client-1",
      table_id,
      platform: "meta",
      status,
      started_at,
      finished_at: started_at,
      window_start: "2026-10-19",
      window_end: "2026-10-25",
      summary:
        status === "mismatch"
          ? {
              counts: { mismatch: 2 },
              findings_total: 2,
              top_findings: [{ kind: "mismatch", campaign: "A" }],
            }
          : {},
      crm_tables: { name: `table ${table_id}` },
      clients: { name: "Client" },
    });
    const { db } = fakeDb({
      rows: [
        run("3", "t1", "ok", "2026-10-26T01:31:00Z"),
        run("2", "t2", "mismatch", "2026-10-26T01:30:30Z"),
        run("1", "t1", "mismatch", "2026-10-25T01:30:00Z"),
      ],
    });
    const status = await getReconciliationStatus(db, {
      tenantIds: ["tenant-1"],
      sinceIso: "2026-10-23T00:00:00Z",
    });
    assertStrictEquals(status.checked, 2);
    assertStrictEquals(status.ok, 1);
    assertStrictEquals(status.with_gaps, 1);
    assertEquals(
      status.items.map((i) => [i.table_id, i.status]),
      [
        ["t2", "mismatch"],
        ["t1", "ok"],
      ],
    );
    assertEquals(status.items[0].top_findings, [
      { kind: "mismatch", campaign: "A" },
    ]);
  },
);
