import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPulseRefreshNote,
  buildPulseRefreshRequestBody,
  createPulseRefreshDeps,
  decidePulseRefresh,
  interpretPulseSnapshotResponse,
  PULSE_REFRESH_MIN_INTERVAL_SECONDS,
  runCampaignPulseRefresh,
} from "./carmen-pulse-refresh.mjs";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-26T10:00:00Z"); // 12:00 in Israel

function fakeDeps(overrides = {}) {
  const calls = {
    assert: [],
    claim: [],
    invoke: [],
    loadPulse: 0,
    order: [],
  };
  const deps = {
    now: () => NOW,
    assertClientVisible: async (clientId) => {
      calls.assert.push(clientId);
      calls.order.push("assert");
    },
    latestCalculatedAt: async () => "2026-10-26T04:00:00Z",
    claimRefresh: async (seconds) => {
      calls.claim.push(seconds);
      calls.order.push("claim");
      return true;
    },
    invokeSnapshot: async (body) => {
      calls.invoke.push(body);
      calls.order.push("invoke");
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          results: [{ tenant_id: TENANT, clients: 12, sent: false }],
        },
      };
    },
    loadPulse: async () => {
      calls.loadPulse += 1;
      calls.order.push("loadPulse");
      return {
        data_source: "deterministic_campaign_pulse_cache",
        auto_refreshed: false,
        count: 12,
        freshness: "2026-10-26T10:00:00Z",
        whatsapp_digest: "🟢 12 תקינים",
        instructions_to_agent: "הנחיית הדופק",
      };
    },
    ...overrides,
  };
  return { deps, calls };
}

test("the snapshot body sends nothing: deliver:false, skip_instant_alerts:true, one tenant", () => {
  assert.deepEqual(buildPulseRefreshRequestBody(TENANT), {
    tenant_id: TENANT,
    deliver: false,
    skip_instant_alerts: true,
    preview_only: true,
    source: "carmen_refresh_tool",
  });
  // A missing tenant would make the snapshot recompute every tenant.
  for (const bad of [undefined, null, "", "system", "all"]) {
    assert.throws(() => buildPulseRefreshRequestBody(bad));
  }
});

test("a stale snapshot is refreshed for the caller's tenant, then read back", async () => {
  const { deps, calls } = fakeDeps();
  const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(calls.invoke.length, 1);
  assert.equal(calls.invoke[0].tenant_id, TENANT);
  assert.equal(calls.invoke[0].deliver, false);
  assert.equal(calls.invoke[0].skip_instant_alerts, true);
  assert.equal(calls.invoke[0].preview_only, true);
  assert.deepEqual(calls.claim, [PULSE_REFRESH_MIN_INTERVAL_SECONDS]);
  assert.deepEqual(calls.order, ["claim", "invoke", "loadPulse"]);
  assert.equal(result.auto_refreshed, true);
  assert.equal(result.refresh.status, "refreshed");
  assert.equal(result.refresh.clients, 12);
  assert.equal(result.refresh.previous_calculated_at, "2026-10-26T04:00:00Z");
  assert.equal(result.whatsapp_digest, "🟢 12 תקינים");
  assert.equal(result.refresh_note, "🔄 רעננתי את בדיקת הדופק עכשיו (12:00).");
  assert.match(result.instructions_to_agent, /refresh_note/);
  assert.match(result.instructions_to_agent, /הנחיית הדופק/);
});

test("a snapshot younger than 10 minutes is returned without a refresh", async () => {
  const { deps, calls } = fakeDeps({
    latestCalculatedAt: async () => "2026-10-26T09:55:00Z",
  });
  const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(calls.claim.length, 0);
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.loadPulse, 1);
  assert.equal(result.auto_refreshed, false);
  assert.equal(result.refresh.status, "fresh_snapshot");
  assert.match(result.instructions_to_agent, /אל תטעני שהנתונים חושבו מחדש/);
});

test("a lost claim (another refresh in the last 10 minutes) returns the stored snapshot", async () => {
  const { deps, calls } = fakeDeps({ claimRefresh: async () => false });
  const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(calls.invoke.length, 0);
  assert.equal(result.refresh.status, "rate_limited");
  assert.equal(result.auto_refreshed, false);
  assert.match(result.refresh_note, /רוענן בדקות האחרונות/);
});

test("without the claim RPC the tool fails closed and does not refresh", async () => {
  const { deps, calls } = fakeDeps({
    claimRefresh: async () => {
      throw new Error("function claim_campaign_pulse_refresh does not exist");
    },
  });
  const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(calls.invoke.length, 0);
  assert.equal(result.refresh.status, "rate_limit_unavailable");
  assert.equal(calls.loadPulse, 1);
});

test("the rate limit holds across calls: once per tenant per 10 minutes", async () => {
  const claims = new Map();
  let clock = NOW.getTime();
  let snapshotAt = "2026-10-26T04:00:00Z";
  let invocations = 0;
  const deps = {
    now: () => new Date(clock),
    assertClientVisible: async () => {},
    // Pretend the snapshot write failed, so freshness alone never blocks.
    latestCalculatedAt: async () => snapshotAt,
    claimRefresh: async (seconds) => {
      const last = claims.get(TENANT);
      if (last !== undefined && clock - last < seconds * 1000) return false;
      claims.set(TENANT, clock);
      return true;
    },
    invokeSnapshot: async () => {
      invocations += 1;
      return { ok: false, status: 500, body: { error: "boom" } };
    },
    loadPulse: async () => ({ freshness: snapshotAt }),
  };
  const first = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(first.refresh.status, "refresh_failed");
  assert.equal(first.refresh.error, "boom");
  clock += 5 * 60 * 1000;
  const second = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(second.refresh.status, "rate_limited");
  clock += 6 * 60 * 1000;
  const third = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(third.refresh.status, "refresh_failed");
  assert.equal(invocations, 2);
});

test("a client the caller may not see is refused before anything runs", async () => {
  const { deps, calls } = fakeDeps({
    assertClientVisible: async () => {
      throw new Error("הלקוח לא משויך אליך");
    },
  });
  const result = await runCampaignPulseRefresh(
    { tenantId: TENANT, clientId: CLIENT },
    deps,
  );
  assert.deepEqual(result, {
    error: "client_not_accessible",
    message: "הלקוח לא משויך אליך",
  });
  assert.equal(calls.claim.length, 0);
  assert.equal(calls.invoke.length, 0);
  assert.equal(calls.loadPulse, 0);
});

test("a visible client is checked first and the refresh still covers only the caller's tenant", async () => {
  const { deps, calls } = fakeDeps();
  const result = await runCampaignPulseRefresh(
    { tenantId: TENANT, clientId: CLIENT },
    deps,
  );
  assert.deepEqual(calls.assert, [CLIENT]);
  assert.deepEqual(calls.order, ["assert", "claim", "invoke", "loadPulse"]);
  assert.equal(calls.invoke[0].tenant_id, TENANT);
  assert.equal(result.refresh.status, "refreshed");
});

test("bad input never reaches the snapshot", async () => {
  const { deps, calls } = fakeDeps();
  assert.equal(
    (await runCampaignPulseRefresh({ tenantId: "system" }, deps)).error,
    "tenant_required",
  );
  assert.equal(
    (
      await runCampaignPulseRefresh(
        { tenantId: TENANT, clientId: "אלפא" },
        deps,
      )
    ).error,
    "invalid_client_id",
  );
  assert.equal(calls.invoke.length + calls.claim.length + calls.loadPulse, 0);
});

test("snapshot answers are read per tenant", () => {
  assert.deepEqual(
    interpretPulseSnapshotResponse(TENANT, {
      ok: true,
      body: { results: [{ tenant_id: TENANT, clients: 3 }] },
    }),
    { status: "refreshed", clients: 3 },
  );
  assert.deepEqual(
    interpretPulseSnapshotResponse(TENANT, {
      ok: false,
      status: 500,
      body: {
        results: [
          { tenant_id: OTHER_TENANT, error: "other" },
          { tenant_id: TENANT, error: "permission denied" },
        ],
      },
    }),
    { status: "refresh_failed", error: "permission denied" },
  );
  // No tenant_heartbeat_settings row: nothing was computed.
  assert.deepEqual(
    interpretPulseSnapshotResponse(TENANT, {
      ok: true,
      body: { success: true, results: [] },
    }),
    { status: "not_configured" },
  );
  assert.deepEqual(
    interpretPulseSnapshotResponse(TENANT, {
      ok: false,
      status: 401,
      body: null,
    }),
    { status: "refresh_failed", error: "HTTP 401" },
  );
});

test("a timed-out snapshot call reports refresh_timeout", async () => {
  const { deps } = fakeDeps({
    invokeSnapshot: async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assert.equal(result.refresh.status, "refresh_timeout");
  assert.equal(result.auto_refreshed, false);
});

test("freshness decision and notes", () => {
  assert.equal(
    decidePulseRefresh({
      lastCalculatedAt: "2026-10-26T09:51:00Z",
      now: NOW,
    }).refresh,
    false,
  );
  assert.equal(
    decidePulseRefresh({ lastCalculatedAt: "2026-10-26T09:49:59Z", now: NOW })
      .refresh,
    true,
  );
  assert.equal(
    decidePulseRefresh({ lastCalculatedAt: null, now: NOW }).refresh,
    true,
  );
  assert.equal(
    buildPulseRefreshNote("fresh_snapshot", {
      // 25.10 is the first day after DST: 05:00 UTC is 07:00 in Israel.
      freshness: "2026-10-25T05:00:00Z",
      now: NOW,
    }),
    "⏱️ בדיקת הדופק כבר עדכנית, ולכן לא הרצתי אותה שוב. זו הבדיקה האחרונה שנשמרה (חושבה ב-25.10 07:00).",
  );
  assert.match(
    buildPulseRefreshNote("not_configured", { freshness: null, now: NOW }),
    /לא מופעלת לארגון הזה.*אין בדיקת דופק שמורה/,
  );
});

test("Supabase deps: tenant-scoped reads, the claim RPC and a service-role POST", async () => {
  const queries = [];
  const rpcs = [];
  const supabase = {
    from(table) {
      const q = { table, filters: [] };
      queries.push(q);
      const chain = {
        select: (columns) => ((q.columns = columns), chain),
        eq: (column, value) => (q.filters.push([column, value]), chain),
        order: (column, opts) => ((q.order = [column, opts]), chain),
        limit: (n) => ((q.limit = n), chain),
        maybeSingle: async () => ({
          data: { calculated_at: "2026-10-26T04:00:00Z" },
          error: null,
        }),
      };
      return chain;
    },
    rpc: async (name, params) => {
      rpcs.push([name, params]);
      return { data: true, error: null };
    },
  };
  const fetched = [];
  const deps = createPulseRefreshDeps({
    supabase,
    tenantId: TENANT,
    requestedBy: "44444444-4444-4444-8444-444444444444",
    supabaseUrl: "https://example.supabase.co/",
    serviceKey: "service-key",
    fetchImpl: async (url, init) => {
      fetched.push([url, init]);
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ tenant_id: TENANT, clients: 1 }] }),
      };
    },
  });
  assert.equal(await deps.latestCalculatedAt(), "2026-10-26T04:00:00Z");
  assert.deepEqual(queries[0].filters, [["tenant_id", TENANT]]);
  assert.equal(queries[0].table, "campaign_pulse_snapshots");
  assert.equal(await deps.claimRefresh(600), true);
  assert.deepEqual(rpcs, [
    [
      "claim_campaign_pulse_refresh",
      {
        p_tenant_id: TENANT,
        p_min_interval_seconds: 600,
        p_requested_by: "44444444-4444-4444-8444-444444444444",
      },
    ],
  ]);
  const response = await deps.invokeSnapshot(
    buildPulseRefreshRequestBody(TENANT),
  );
  assert.equal(response.ok, true);
  const [url, init] = fetched[0];
  assert.equal(
    url,
    "https://example.supabase.co/functions/v1/campaign-pulse-snapshot",
  );
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer service-key");
  const body = JSON.parse(init.body);
  assert.equal(body.deliver, false);
  assert.equal(body.skip_instant_alerts, true);
  assert.equal(body.tenant_id, TENANT);
  assert.ok(init.signal, "the call has a timeout");
});

test("the snapshot's instant-alert gate stops on the refresh body", async () => {
  const { instantPulseAlertsGate } = await import("./pulse-instant-alerts.ts");
  const gate = instantPulseAlertsGate({
    campaignPulseEnabled: true,
    rules: { instant_wa_enabled: true },
    body: buildPulseRefreshRequestBody(TENANT),
  });
  assert.deepEqual(gate, { run: false, reason: "skip_instant_alerts" });
});
