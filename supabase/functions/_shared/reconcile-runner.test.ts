import {
  assert,
  assertEquals,
  assertFalse,
  assertStrictEquals,
} from "jsr:@std/assert@1";
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
  MAX_DEFERRED,
  type MetaAccountWithSpend,
  nextAfterChunk,
  type ReconcileStore,
  resyncAllowedAt,
  runReconcileChunk,
  runUnmappedAccountsCheck,
  type RunnerTable,
  type StoredRun,
  type TenantConnections,
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
    // b is passed over: its skipped run says why (the trust line and the
    // persisting check look past it), and the worker retries it after the walk.
    assertEquals(
      saved.map((s) => [
        s.run.table_id,
        s.run.status,
        s.run.summary.error_kind ?? s.run.summary.skipped_reason,
      ]),
      [
        ["a", "failed", "rate_limit"],
        ["b", "skipped", "platform_rate_limited"],
        ["c", "ok", undefined],
      ],
    );
    assertEquals(r.rate_limited_tables, ["b"]);
    assertEquals(
      r.processed.map((p) => [p.table_id, p.status, p.skipped_reason]),
      [
        ["a", "failed", undefined],
        ["b", "skipped", "platform_rate_limited"],
        ["c", "ok", undefined],
      ],
    );
    assertStrictEquals(r.done, true);
  },
);

Deno.test(
  "tables passed over for a rate limit get one more try after the walk",
  async () => {
    const tables = [table("a"), table("b"), table("c", "google_ads")];
    const fixture = createFixtureSource(
      {
        a: { account, rows: [] },
        b: { account, rows: [] },
        c: { account, rows: [] },
      },
      "staging",
    );
    let metaCalls = 0;
    // Meta refuses the first request of the night, then recovers.
    const meta: PlatformSource = {
      name: "meta",
      account: (t) => {
        metaCalls += 1;
        return metaCalls === 1
          ? Promise.reject(
              new ReconcileSourceError(
                "rate_limit",
                "Meta 400: too many calls",
              ),
            )
          : fixture.account(t);
      },
      campaignDays: fixture.campaignDays,
    };
    const { store, saved } = memoryStore(tables, {});
    const chunkDeps = (s: ReconcileStore) => ({
      ...deps(s, meta),
      sourceFor: (t: ReconcileTable) =>
        t.integration_type === "google_ads" ? fixture : meta,
    });

    const walk = await runReconcileChunk(chunkDeps(store), {
      cursor: null,
      maxTables: 5,
    });
    assertStrictEquals(walk.done, true);
    const retry = nextAfterChunk("tables", [], walk);
    assertEquals(retry, { phase: "retry", cursor: null, deferred: ["b"] });

    // The retry pass lists only the deferred tables (the worker's table_ids filter).
    const retryStore: ReconcileStore = {
      ...store,
      listTables: (o) =>
        store
          .listTables(o)
          .then((ts) => ts.filter((t) => retry.deferred!.includes(t.id))),
    };
    const again = await runReconcileChunk(chunkDeps(retryStore), {
      cursor: null,
      maxTables: 5,
    });
    assertEquals(nextAfterChunk("retry", retry.deferred!, again), {
      phase: "accounts",
      cursor: null,
    });
    assertEquals(
      saved
        .filter((x) => x.run.table_id === "b")
        .map((x) => [x.run.status, x.run.summary.skipped_reason]),
      [
        ["skipped", "platform_rate_limited"],
        ["ok", undefined],
      ],
    );
  },
);

Deno.test("the chain carries deferred tables until the retry pass", () => {
  const chunk = (
    done: boolean,
    rate_limited_tables: string[],
    next_cursor: string | null = done ? null : "c",
  ) => ({ done, next_cursor, rate_limited_tables });
  // Mid-walk: the cursor moves on, the passed-over tables ride along (once each).
  assertEquals(nextAfterChunk("tables", ["x"], chunk(false, ["x", "y"])), {
    phase: "tables",
    cursor: "c",
    deferred: ["x", "y"],
  });
  // Nothing passed over: straight on to the accounts check.
  assertEquals(nextAfterChunk("tables", [], chunk(true, [])), {
    phase: "accounts",
    cursor: null,
  });
  // The retry pass keeps its list while it pages and never defers again.
  assertEquals(nextAfterChunk("retry", ["x"], chunk(false, ["x"])), {
    phase: "retry",
    cursor: "c",
    deferred: ["x"],
  });
  assertEquals(nextAfterChunk("retry", ["x"], chunk(true, ["x"])), {
    phase: "accounts",
    cursor: null,
  });
  // The carried list is capped; tables past the cap still have their skipped run.
  const many = Array.from({ length: MAX_DEFERRED + 5 }, (_, i) => `t${i}`);
  assertStrictEquals(
    nextAfterChunk("tables", [], chunk(false, many)).deferred?.length,
    MAX_DEFERRED,
  );
});

Deno.test(
  "a per-ad-account throttle fails only that table, not the platform",
  async () => {
    const tables = [table("a"), table("b")];
    const fixture = createFixtureSource(
      { b: { account, rows: [] } },
      "staging",
    );
    const meta: PlatformSource = {
      name: "meta",
      account: (t) =>
        t.id === "a"
          ? Promise.reject(
              new ReconcileSourceError(
                "rate_limit",
                "Meta 400: ad account has too many API calls",
                "account",
              ),
            )
          : fixture.account(t),
      campaignDays: fixture.campaignDays,
    };
    const { store, saved } = memoryStore(tables, {});
    await runReconcileChunk(deps(store, meta), { cursor: null, maxTables: 5 });
    assertEquals(
      saved.map((s) => [s.run.table_id, s.run.status]),
      [
        ["a", "failed"],
        ["b", "ok"],
      ],
    );
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
          return Promise.resolve({ queued: true });
        },
      }),
      { cursor: null, maxTables: 5 },
    );
    // Compared days are 19–24 (25 waits for the morning sync). The resync runs
    // through Jerusalem's today, because the sync clears every row from the
    // start date onwards before it inserts.
    assertEquals(resyncs, [["a", "2026-10-19", "2026-10-26"]]);
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
    assertStrictEquals(r.processed[0].resync?.queued, true);
    assertEquals(
      [saved[0].run.window_start, saved[0].run.window_end],
      ["2026-10-19", "2026-10-24"],
    );
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

Deno.test(
  "auto-resync: never for Meta insights tables, whose sync ignores the window",
  async () => {
    const t = table("a", "facebook_insights", {
      integration_settings: { reconcile_autoresync: true },
    });
    const source = createFixtureSource(
      { a: { account, rows: [day("1", 500)] } },
      "staging",
    );
    const { store, saved } = memoryStore([t], { a: [day("1", 100)] });
    let calls = 0;
    await runReconcileChunk(
      deps(store, source, new CallBudget(100), {
        triggerResync: () => {
          calls += 1;
          return Promise.resolve({ queued: true });
        },
      }),
      { cursor: null, maxTables: 5 },
    );
    assertStrictEquals(calls, 0);
    assertEquals(saved[0].run.summary.resync, {
      skipped: "sync_ignores_window",
    });
  },
);

Deno.test(
  "auto-resync keeps half an hour clear of the next refresh window",
  () => {
    assert(resyncAllowedAt(new Date("2026-10-26T01:30:00Z")));
    assert(resyncAllowedAt(new Date("2026-10-26T01:59:00Z")));
    assertFalse(resyncAllowedAt(new Date("2026-10-26T02:10:00Z")));
    assertFalse(resyncAllowedAt(new Date("2026-10-26T03:00:00Z")));
    assertFalse(resyncAllowedAt(new Date("2026-10-26T11:05:00Z")));
    assert(resyncAllowedAt(new Date("2026-10-26T14:00:00Z")));
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

const acct = (
  account_id: string,
  spend_7d: number,
  name = account_id,
): MetaAccountWithSpend => ({ account_id, name, currency: "ILS", spend_7d });

/** nextTenant over a fixed list, in tenant order. */
const tenantWalk = (groups: TenantConnections[]) => (after: string | null) =>
  Promise.resolve(
    groups
      .filter((g) => !after || g.tenant_id > after)
      .sort((a, b) => a.tenant_id.localeCompare(b.tenant_id))[0] || null,
  );

function unmappedDeps(
  groups: TenantConnections[],
  accountsByToken: Record<string, MetaAccountWithSpend[] | Error>,
  budget: CallBudget,
  saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }>,
  cursor: string | null = null,
) {
  return {
    cursor,
    nextTenant: tenantWalk(groups),
    mapped: new Set(["act_1"]),
    listAccounts: (token: string) => {
      budget.take();
      const answer = accountsByToken[token];
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer || []);
    },
    saveRun: (run: StoredRun, findings: ReconcileFinding[]) => {
      saved.push({ run, findings });
      return Promise.resolve("x");
    },
    budget,
    now: () => NOW,
    deadline: Date.now() + 60_000,
  };
}

Deno.test(
  "unmapped accounts: spend above the floor and not mapped anywhere",
  async () => {
    const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
    const accounts = [
      acct("act_1", 900, "Mapped"),
      acct("act_2", 450, "Orphan"),
      acct("act_3", 12, "Tiny"),
    ];
    const r = await runUnmappedAccountsCheck(
      unmappedDeps(
        [
          {
            tenant_id: "tenant-1",
            connections: [
              { id: "i1", token: "t1" },
              { id: "i2", token: "t2" },
            ],
          },
          { tenant_id: "tenant-2", connections: [{ id: "i3", token: "t3" }] },
        ],
        {
          t1: accounts,
          t2: accounts,
          t3: new ReconcileSourceError("auth", "Meta 400: expired"),
        },
        new CallBudget(10),
        saved,
      ),
    );
    assertStrictEquals(r.done, true);
    assertStrictEquals(r.next_cursor, null);
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

Deno.test(
  "unmapped accounts: a tenant split across calls is checked whole, never 'ok' from half",
  async () => {
    // tenant-2's first connection sees an unmapped account; its second sees
    // only mapped ones. The first call runs out of budget between them.
    const groups: TenantConnections[] = [
      { tenant_id: "tenant-1", connections: [{ id: "a", token: "ta" }] },
      {
        tenant_id: "tenant-2",
        connections: [
          { id: "c1", token: "t1" },
          { id: "c2", token: "t2" },
        ],
      },
    ];
    const accounts = {
      ta: [acct("act_1", 300)],
      t1: [acct("act_9", 500)],
      t2: [acct("act_1", 800)],
    };
    const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
    const first = await runUnmappedAccountsCheck(
      unmappedDeps(groups, accounts, new CallBudget(2), saved),
    );
    // tenant-1 done; tenant-2 was cut short, so nothing is stored for it yet.
    assertStrictEquals(first.done, false);
    assertStrictEquals(first.next_cursor, "tenant-1");
    assertEquals(
      saved.map((s) => [s.run.tenant_id, s.run.status]),
      [["tenant-1", "ok"]],
    );

    const second = await runUnmappedAccountsCheck(
      unmappedDeps(
        groups,
        accounts,
        new CallBudget(10),
        saved,
        first.next_cursor,
      ),
    );
    assertStrictEquals(second.done, true);
    const tenant2 = saved.filter((s) => s.run.tenant_id === "tenant-2");
    assertStrictEquals(tenant2.length, 1);
    assertStrictEquals(tenant2[0].run.status, "mismatch");
    assertEquals(
      tenant2[0].findings.map((f) => f.details.account_id),
      ["act_9"],
    );
    assertStrictEquals(tenant2[0].run.summary.incomplete, undefined);
  },
);

Deno.test(
  "unmapped accounts: a tenant too big for one call is stored flagged incomplete and the walk moves on",
  async () => {
    const groups: TenantConnections[] = [
      {
        tenant_id: "tenant-1",
        connections: [
          { id: "c1", token: "t1" },
          { id: "c2", token: "t2" },
        ],
      },
      { tenant_id: "tenant-2", connections: [{ id: "c3", token: "t3" }] },
    ];
    const accounts = { t1: [acct("act_1", 50)], t2: [], t3: [] };
    const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
    const first = await runUnmappedAccountsCheck(
      unmappedDeps(groups, accounts, new CallBudget(1), saved),
    );
    assertStrictEquals(first.next_cursor, "tenant-1");
    assertEquals(
      saved.map((s) => [
        s.run.tenant_id,
        s.run.status,
        s.run.summary.incomplete,
      ]),
      [["tenant-1", "skipped", true]],
    );
    const second = await runUnmappedAccountsCheck(
      unmappedDeps(
        groups,
        accounts,
        new CallBudget(5),
        saved,
        first.next_cursor,
      ),
    );
    assertStrictEquals(second.done, true);
    assertEquals(
      saved.map((s) => s.run.tenant_id),
      ["tenant-1", "tenant-2"],
    );
  },
);

Deno.test(
  "unmapped accounts: a tenant with only private connections is recorded as not checked",
  async () => {
    const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
    const budget = new CallBudget(10);
    const r = await runUnmappedAccountsCheck(
      unmappedDeps(
        [
          { tenant_id: "tenant-1", connections: [] },
          { tenant_id: "tenant-2", connections: [{ id: "c1", token: "t1" }] },
        ],
        { t1: [acct("act_1", 300)] },
        budget,
        saved,
      ),
    );
    assertStrictEquals(r.done, true);
    // No Meta call for tenant-1, and no "ok" that covered nothing.
    assertStrictEquals(budget.used, 1);
    assertEquals(
      saved.map((s) => [
        s.run.tenant_id,
        s.run.status,
        s.run.summary.unmapped_check,
        s.run.summary.skipped_reason,
      ]),
      [
        ["tenant-1", "skipped", "no_org_connections", "no_org_connections"],
        ["tenant-2", "ok", undefined, undefined],
      ],
    );
  },
);

Deno.test(
  "unmapped accounts: the walk only ends when no tenant is left",
  async () => {
    const groups: TenantConnections[] = Array.from({ length: 250 }, (_, i) => ({
      tenant_id: `tenant-${String(i).padStart(3, "0")}`,
      connections: [{ id: `c${i}`, token: `t${i}` }],
    }));
    const saved: Array<{ run: StoredRun; findings: ReconcileFinding[] }> = [];
    let cursor: string | null = null;
    let calls = 0;
    for (;;) {
      calls += 1;
      const r = await runUnmappedAccountsCheck(
        unmappedDeps(groups, {}, new CallBudget(60), saved, cursor),
      );
      if (r.done) break;
      cursor = r.next_cursor;
    }
    assertStrictEquals(saved.length, 250);
    assertStrictEquals(calls, 5);
  },
);
