import assert from "node:assert/strict";
import test from "node:test";

import {
  PULSE_TARGET_TOOLS,
  applyApprovedPulseTarget,
  executePulseTargetTool,
  isPulseTargetTool,
  type PulseTargetToolContext,
} from "./carmen-pulse-target-tools.ts";

type Row = Record<string, any>;

/** In-memory stand-in for the supabase-js query builder (only what the tools use). */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const writes: Array<{ table: string; op: string; rows: Row[] }> = [];
  let nextId = 1;
  function from(name: string) {
    tables[name] ??= [];
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: Row = {};
    const run = () => {
      if (op === "insert") {
        const row = { id: `row-${nextId++}`, ...payload };
        tables[name].push(row);
        writes.push({ table: name, op, rows: [row] });
        return { data: [row], error: null };
      }
      const matched = tables[name].filter((row) =>
        filters.every((f) => f(row)),
      );
      if (op === "update") {
        for (const row of matched) Object.assign(row, structuredClone(payload));
        writes.push({ table: name, op, rows: matched });
      }
      return { data: matched, error: null };
    };
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq(col: string, value: unknown) {
        filters.push((row) => row[col] === value);
        return api;
      },
      in(col: string, values: unknown[]) {
        filters.push((row) => values.includes(row[col]));
        return api;
      },
      not(col: string) {
        filters.push((row) => row[col] !== null && row[col] !== undefined);
        return api;
      },
      update(patch: Row) {
        op = "update";
        payload = patch;
        return api;
      },
      insert(row: Row) {
        op = "insert";
        payload = row;
        return api;
      },
      maybeSingle: async () => {
        const result = run();
        return { data: result.data[0] ?? null, error: null };
      },
      single: async () => {
        const result = run();
        return { data: result.data[0] ?? null, error: null };
      },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return api;
  }
  return { from, tables, writes };
}

const NOW = new Date("2026-10-26T08:00:00.000Z");
const RATIONALE =
  "ענף שיפוצים בישראל: CPL של ₪50–70 בפייסבוק; ללקוח ממוצע ₪52 ב־4 השבועות האחרונים";

function ctx(
  over: Partial<PulseTargetToolContext> = {},
): PulseTargetToolContext {
  return {
    tenantId: "tenant-1",
    accessibleTenantIds: ["tenant-1"],
    actorUserId: "user-1",
    agentId: "agent-1",
    callerRole: "owner",
    callerPhone: null,
    isManagerRole: true,
    isTeamManager: false,
    managedAgencyIds: [],
    callerCampaignerId: null,
    assertClientAccess: async () => {},
    now: () => NOW,
    ...over,
  };
}

function seed(settings: Row = {}) {
  return {
    crm_tables: [
      {
        id: "t-meta",
        client_id: "client-1",
        tenant_id: "tenant-1",
        integration_type: "facebook_insights",
        integration_settings: { last_sync_at: "2026-10-26", ...settings },
      },
      {
        id: "t-google",
        client_id: "client-1",
        tenant_id: "tenant-1",
        integration_type: "google_ads",
        integration_settings: {},
      },
    ],
    clients: [{ id: "client-1", name: "שיפוצי אבי", tenant_id: "tenant-1" }],
    campaign_pulse_snapshots: [
      {
        client_id: "client-1",
        tenant_id: "tenant-1",
        calculated_at: "2026-10-26T04:00:00Z",
        campaign_breakdown: [
          {
            campaign_key: "k1",
            campaign_id: "c1",
            campaign_name: "לידים שיפוץ",
            client_id: "client-1",
            table_id: "t-meta",
            platform: "meta",
            goal: "leads",
            spend_7d: 900,
            delivery_status: "active",
          },
        ],
      },
    ],
    agent_approval_queue: [] as Row[],
  };
}

test("the three tools are registered with their names", () => {
  assert.deepEqual(
    PULSE_TARGET_TOOLS.map((t) => t.name),
    ["get_pulse_targets", "set_market_target", "set_pulse_target"],
  );
  assert.ok(isPulseTargetTool("set_market_target"));
  assert.ok(!isPulseTargetTool("set_campaign_table_active"));
  const market = PULSE_TARGET_TOOLS[1];
  assert.match(market.description, /בנצ׳מרקים של הענף/);
  assert.match(market.description, /ההיסטוריה של הלקוח/);
  assert.match(market.description, /לא דורס יעד מאושר/);
});

test("set_market_target never overwrites an approved target", async () => {
  const db = fakeDb(seed({ pulse_platform_targets: { leads: { cpl: 70 } } }));
  db.tables.crm_tables = db.tables.crm_tables.filter((t) => t.id === "t-meta");
  const result: any = await executePulseTargetTool(
    db,
    ctx(),
    "set_market_target",
    {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 55,
      rationale: RATIONALE,
    },
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "approved_target_exists");
  assert.equal(result.existing.value, 70);
  assert.equal(db.writes.length, 0);

  // A campaign inherits the approved platform target, so it is refused too.
  const campaign: any = await executePulseTargetTool(
    db,
    ctx(),
    "set_market_target",
    {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 55,
      rationale: RATIONALE,
      campaign_id: "c1",
    },
  );
  assert.equal(campaign.error, "approved_target_exists");
  assert.equal(db.writes.length, 0);
});

test("set_market_target writes a labelled carmen_market target with rationale and time", async () => {
  const db = fakeDb(seed());
  const result: any = await executePulseTargetTool(
    db,
    ctx({ actorUserId: null }), // Carmen on her own may set a market target
    "set_market_target",
    {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 60,
      rationale: RATIONALE,
      campaign_id: "c1",
    },
  );
  assert.equal(result.success, true);
  assert.equal(result.label, "יעד שוק (כרמן)");
  assert.equal(result.scope, "campaign");
  const meta = db.tables.crm_tables.find((t) => t.id === "t-meta")!;
  assert.deepEqual(meta.integration_settings.pulse_targets.c1, {
    cpl: 60,
    source: "carmen_market",
    rationale: RATIONALE,
    set_at: NOW.toISOString(),
    set_by: "carmen",
    goal: "leads",
  });
  assert.equal(meta.integration_settings.last_sync_at, "2026-10-26");
  const google = db.tables.crm_tables.find((t) => t.id === "t-google")!;
  assert.deepEqual(google.integration_settings, {}, "other platform untouched");
});

test("set_market_target needs a real rationale and client access", async () => {
  const db = fakeDb(seed());
  const short: any = await executePulseTargetTool(
    db,
    ctx(),
    "set_market_target",
    {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 60,
      rationale: "שוק",
    },
  );
  assert.equal(short.error, "rationale_required");
  await assert.rejects(
    executePulseTargetTool(
      db,
      ctx({
        assertClientAccess: async () => {
          throw new Error("אין הרשאה ללקוח");
        },
      }),
      "set_market_target",
      {
        client_id: "client-1",
        platform: "meta",
        goal: "leads",
        value: 60,
        rationale: RATIONALE,
      },
    ),
    /אין הרשאה/,
  );
  assert.equal(db.writes.length, 0);
});

test("set_pulse_target queues an approval for a human and writes nothing", async () => {
  const db = fakeDb(seed());
  const noHuman: any = await executePulseTargetTool(
    db,
    ctx({ actorUserId: null }),
    "set_pulse_target",
    { client_id: "client-1", platform: "meta", goal: "leads", value: 45 },
  );
  assert.equal(noHuman.error, "human_requester_required");

  const queued: any = await executePulseTargetTool(
    db,
    ctx(),
    "set_pulse_target",
    {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 45,
      campaign_id: "c1",
    },
  );
  assert.equal(queued.pending_approval, true);
  const [row] = db.tables.agent_approval_queue;
  assert.equal(row.status, "pending");
  assert.equal(row.tool_name, "set_pulse_target");
  assert.equal(row.requested_by, "user-1");
  assert.deepEqual(row.tool_input.table_ids, ["t-meta"]);
  assert.equal(row.tool_input.campaign_name, "לידים שיפוץ");
  assert.match(row.title, /CPL 45/);
  assert.ok(!db.writes.some((w) => w.table === "crm_tables"));

  const again: any = await executePulseTargetTool(
    db,
    ctx(),
    "set_pulse_target",
    {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      value: 45,
      campaign_id: "c1",
    },
  );
  assert.equal(again.reused_existing, true);
  assert.equal(db.tables.agent_approval_queue.length, 1);
});

test("an approved set_pulse_target replaces Carmen's market target", async () => {
  const db = fakeDb(
    seed({
      pulse_targets: {
        c1: { cpl: 60, source: "carmen_market", rationale: RATIONALE },
      },
    }),
  );
  const outcome = await applyApprovedPulseTarget(
    db,
    {
      tenant_id: "tenant-1",
      requested_by: "user-1",
      tool_input: {
        client_id: "client-1",
        platform: "meta",
        goal: "leads",
        kind: "cpl",
        value: 45,
        campaign_id: "c1",
        campaign_name: "לידים שיפוץ",
        table_ids: ["t-meta", "t-other-client"],
      },
    },
    "owner-1",
    () => NOW,
  );
  assert.equal(outcome.ok, true);
  const meta = db.tables.crm_tables.find((t) => t.id === "t-meta")!;
  assert.deepEqual(meta.integration_settings.pulse_targets.c1, {
    cpl: 45,
    source: "approved",
    set_at: NOW.toISOString(),
    set_by: "user-1",
    approved_by: "owner-1",
    goal: "leads",
  });
});

test("get_pulse_targets shows sources and the spending campaigns without one", async () => {
  const db = fakeDb(
    seed({
      pulse_platform_targets: {
        ecommerce: {
          roas: 3,
          source: "carmen_market",
          rationale: RATIONALE,
          set_at: "2026-10-20T08:00:00Z",
        },
      },
    }),
  );
  const result: any = await executePulseTargetTool(
    db,
    ctx(),
    "get_pulse_targets",
    { client_id: "client-1" },
  );
  const [client] = result.clients;
  assert.equal(client.client_name, "שיפוצי אבי");
  assert.equal(client.platform_targets[0].source, "carmen_market");
  assert.equal(client.platform_targets[0].set_at, "2026-10-20T08:00:00Z");
  assert.equal(result.missing_count, 1);
  assert.equal(client.missing[0].campaigns[0].campaign_id, "c1");
});
