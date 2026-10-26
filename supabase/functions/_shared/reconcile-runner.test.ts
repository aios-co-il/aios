import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  CallBudget,
  type CampaignDayRow,
  type FixtureTable,
  type PlatformSource,
  type ReconcileFinding,
  ReconcileSourceError,
  type ReconcileTable,
  createFixtureSource,
} from "./reconcile-core.ts";
import {
  insideRefreshWindow,
  type ReconcileStore,
  runReconcileChunk,
  runUnmappedAccountsCheck,
  type RunnerTable,
  type StoredRun,
} from "./reconcile-runner.ts";

const NOW = new Date("2026-10-26T01:30:00Z");

const table = (
  id: string,
  type = "facebook_insights",
  extra: Partial<RunnerTable> = {},
): RunnerTable => ({
  id,
  tenant_id: "tenant-1",
  client_id: `client-${id}`,
  integration_type: type,
  integration_settings: {},
  client_status: "active",
  last_sync_at: "2026-10-25T23:00:00Z",
  ...extra,
});

const day = (campaign: string, spend: number): CampaignDayRow => ({
  campaign_id: campaign,
  campaign_name: `C${campaign}`,
  date: "2026-10-20",
  data: { date: "2026-10-20", campaign_id: campaign, spend },
});

const account = { account_id: "act_1", timezone: "UTC", currency: "ILS" };

function memoryStore(
  tables: RunnerTable[],
  aios: Record<string, CampaignDayRow[]>,
  previous: Record<string, string> = {},
) {
  const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
  const store: ReconcileStore = {
    listTables: ({ afterId, limit }) =>
      Promise.resolve(
        tables
          .filter((t) => !afterId || t.id > afterId)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit),
      ),
    readAios: (t) => Promise.resolve(aios[t.id] || []),
    latestRun: (id) =>
      Promise.resolve(
        previous[id]
          ? { status: previous[id], started_at: "x", summary: {} }
          : null,
      ),
    saveRun: (run, findings) => {
      saved.push({ run, findings });
      return Promise.resolve(`run-${saved.length}`);
    },
  };
  return { store, saved };
}

const deps = (
  store: ReconcileStore,
  source: PlatformSource,
  budget = new CallBudget(100),
  extra: Record<string, unknown> = {},
) => ({
  store,
  sourceFor: () => source,
  budget,
  now: () => NOW,
  deadline: Date.now() + 60_000,
  ...extra,
});

Deno.test("chunks follow the cursor until every table is done", async () => {
  const tables = ["a", "b", "c", "d", "e"].map((id) => table(id));
  const fixtures: Record<string, FixtureTable> = {};
  for (const t of tables) fixtures[t.id] = { account, rows: [day("1", 100)] };
  const source = createFixtureSource(fixtures, "staging");
  const aios = Object.fromEntries(tables.map((t) => [t.id, [day("1", 100)]]));
  const { store, saved } = memoryStore(tables, aios);

  const first = await runReconcileChunk(deps(store, source), {
    cursor: null,
    maxTables: 2,
  });
  assertEquals(
    first.processed.map((p) => p.table_id),
    ["a", "b"],
  );
  assertStrictEquals(first.next_cursor, "b");
  assertStrictEquals(first.done, false);
  assertStrictEquals(first.stopped, "max_tables");

  const second = await runReconcileChunk(deps(store, source), {
    cursor: first.next_cursor,
    maxTables: 10,
  });
  assertEquals(
    second.processed.map((p) => p.table_id),
    ["c", "d", "e"],
  );
  assertStrictEquals(second.done, true);
  assertStrictEquals(second.next_cursor, null);
  assertStrictEquals(saved.length, 5);
  assert(saved.every((s) => s.run.status === "ok"));
});

Deno.test(
  "tables of inactive clients are passed over without a run",
  async () => {
    const tables = [
      table("a", "facebook_insights", { client_status: "paused" }),
      table("b"),
    ];
    const source = createFixtureSource({ b: { account, rows: [] } }, "staging");
    const { store, saved } = memoryStore(tables, {});
    const r = await runReconcileChunk(deps(store, source), {
      cursor: null,
      maxTables: 5,
    });
    assertEquals(
      r.processed.map((p) => p.table_id),
      ["b"],
    );
    assertEquals(
      saved.map((s) => s.run.table_id),
      ["b"],
    );
  },
);

Deno.test(
  "a rate-limited platform is not called again in the same chunk",
  async () => {
    const tables = [table("a"), table("b"), table("c", "google_ads")];
    let calls = 0;
    const meta: PlatformSource = {
      name: "meta",
      account: () => {
        calls += 1;
        return Promise.reject(
          new ReconcileSourceError("rate_limit", "Meta 400: too many calls"),
        );
      },
      campaignDays: () => Promise.resolve({ rows: [] }),
    };
    const google = createFixtureSource({ c: { account, rows: [] } }, "staging");
    const { store, saved } = memoryStore(tables, {});
    const r = await runReconcileChunk(
      {
        ...deps(store, meta),
        sourceFor: (t: ReconcileTable) =>
          t.integration_type === "google_ads" ? google : meta,
      },
      { cursor: null, maxTables: 5 },
    );
    assertStrictEquals(calls, 1);
    assertEquals(
      saved.map((s) => [
        s.run.table_id,
        s.run.status,
        s.run.summary.skipped_reason ?? s.run.summary.error_kind,
      ]),
      [
        ["a", "failed", "rate_limit"],
        ["b", "skipped", "platform_rate_limited"],
        ["c", "ok", undefined],
      ],
    );
    assertStrictEquals(r.done, true);
  },
);

Deno.test(
  "an exhausted budget stops before a table and keeps the cursor",
  async () => {
    const tables = [table("a"), table("b")];
    const fixtures = {
      a: { account, rows: [] },
      b: { account, rows: [] },
    };
    const fixture = createFixtureSource(fixtures, "staging");
    // Each table takes 4 calls; the budget only has room for one table.
    const budget = new CallBudget(6);
    const counting: PlatformSource = {
      name: "meta",
      account: (t) => {
        for (let i = 0; i < 4; i++) budget.take();
        return fixture.account(t);
      },
      campaignDays: fixture.campaignDays,
    };
    const { store, saved } = memoryStore(tables, {});
    const r = await runReconcileChunk(deps(store, counting, budget), {
      cursor: null,
      maxTables: 5,
    });
    assertEquals(
      r.processed.map((p) => p.table_id),
      ["a"],
    );
    assertStrictEquals(r.stopped, "budget");
    assertStrictEquals(r.next_cursor, "a");
    assertStrictEquals(saved.length, 1);
  },
);

Deno.test(
  "auto-resync: once on a first mismatch, outside refresh windows, only when enabled",
  async () => {
    const mk = (id: string, autoresync: boolean) =>
      table(id, "google_ads", {
        integration_settings: { reconcile_autoresync: autoresync },
      });
    const tables = [mk("a", true), mk("b", true), mk("c", false)];
    const fixtures: Record<string, FixtureTable> = {};
    for (const t of tables)
      fixtures[t.id] = {
        account,
        rows: [
          {
            ...day("1", 0),
            data: { date: "2026-10-20", campaign_id: "1", cost: 500 },
          },
        ],
      };
    const source = createFixtureSource(fixtures, "staging");
    const aios = Object.fromEntries(
      tables.map((t) => [
        t.id,
        [
          {
            ...day("1", 0),
            data: { date: "2026-10-20", campaign_id: "1", cost: 100 },
          },
        ],
      ]),
    );
    // b already mismatched last night (and was resynced then): this run is the re-check.
    const { store, saved } = memoryStore(tables, aios, { b: "mismatch" });
    const resyncs: Array<[string, string, string]> = [];
    const r = await runReconcileChunk(
      deps(store, source, new CallBudget(100), {
        triggerResync: (
          t: ReconcileTable,
          w: { start: string; end: string },
        ) => {
          resyncs.push([t.id, w.start, w.end]);
          return Promise.resolve({ ok: true });
        },
      }),
      { cursor: null, maxTables: 5 },
    );
    assertEquals(resyncs, [["a", "2026-10-19", "2026-10-25"]]);
    assertEquals(
      saved.map((s) => [
        s.run.table_id,
        s.run.status,
        !!s.run.summary.resync,
        !!s.run.summary.persisting,
      ]),
      [
        ["a", "mismatch", true, false],
        ["b", "mismatch", false, true],
        ["c", "mismatch", false, false],
      ],
    );
    assertStrictEquals(r.processed[0].resync?.ok, true);
    assertEquals(saved[0].run.summary.top_findings, [
      {
        kind: "mismatch",
        campaign: "C1",
        date: "2026-10-20",
        metric: "spend",
        aios: 100,
        platform: 500,
      },
    ]);
  },
);

Deno.test("refresh windows cover the morning and afternoon syncs", () => {
  assertStrictEquals(
    insideRefreshWindow(new Date("2026-10-26T01:30:00Z")),
    false,
  );
  assertStrictEquals(
    insideRefreshWindow(new Date("2026-10-26T02:45:00Z")),
    true,
  );
  assertStrictEquals(
    insideRefreshWindow(new Date("2026-10-26T04:15:00Z")),
    true,
  );
  assertStrictEquals(
    insideRefreshWindow(new Date("2026-10-26T04:30:00Z")),
    false,
  );
  assertStrictEquals(
    insideRefreshWindow(new Date("2026-10-26T12:00:00Z")),
    true,
  );
});

Deno.test(
  "unmapped accounts: spend above the floor and not mapped anywhere",
  async () => {
    const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
    const r = await runUnmappedAccountsCheck({
      connections: [
        { id: "i1", tenant_id: "tenant-1", token: "t1" },
        { id: "i2", tenant_id: "tenant-1", token: "t2" },
        { id: "i3", tenant_id: "tenant-2", token: "t3" },
      ],
      mapped: new Set(["act_1"]),
      listAccounts: (token) =>
        token === "t3"
          ? Promise.reject(
              new ReconcileSourceError("auth", "Meta 400: expired"),
            )
          : Promise.resolve([
              {
                account_id: "act_1",
                name: "Mapped",
                currency: "ILS",
                spend_7d: 900,
              },
              {
                account_id: "act_2",
                name: "Orphan",
                currency: "ILS",
                spend_7d: 450,
              },
              {
                account_id: "act_3",
                name: "Tiny",
                currency: "ILS",
                spend_7d: 12,
              },
            ]),
      saveRun: (run, findings) => {
        saved.push({ run, findings });
        return Promise.resolve("x");
      },
      budget: new CallBudget(10),
      now: () => NOW,
      deadline: Date.now() + 60_000,
    });
    assertStrictEquals(r.done, true);
    assertEquals(
      saved.map((s) => [
        s.run.tenant_id,
        s.run.status,
        s.findings.map((f) => f.details.account_id),
      ]),
      [
        ["tenant-1", "mismatch", ["act_2"]],
        ["tenant-2", "failed", []],
      ],
    );
    assertStrictEquals(saved[0].run.table_id, null);
  },
);
