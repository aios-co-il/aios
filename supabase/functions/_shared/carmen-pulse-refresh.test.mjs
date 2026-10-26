import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  buildPulseRefreshDigestReply,
  buildPulseRefreshNote,
  buildPulseRefreshRequestBody,
  createPulseRefreshDeps,
  decidePulseRefresh,
  interpretPulseSnapshotResponse,
  PULSE_REFRESH_MIN_INTERVAL_SECONDS,
  pulseRefreshCallerRefusal,
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

Deno.test(
  "the snapshot body sends nothing: deliver:false, skip_instant_alerts:true, one tenant",
  () => {
    assertEquals(buildPulseRefreshRequestBody(TENANT), {
      tenant_id: TENANT,
      deliver: false,
      skip_instant_alerts: true,
      preview_only: true,
      source: "carmen_refresh_tool",
    });
    // A missing tenant would make the snapshot recompute every tenant.
    for (const bad of [undefined, null, "", "system", "all"]) {
      assertThrows(() => buildPulseRefreshRequestBody(bad));
    }
  },
);

Deno.test(
  "a stale snapshot is refreshed for the caller's tenant, then read back",
  async () => {
    const { deps, calls } = fakeDeps();
    const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(calls.invoke.length, 1);
    assertStrictEquals(calls.invoke[0].tenant_id, TENANT);
    assertStrictEquals(calls.invoke[0].deliver, false);
    assertStrictEquals(calls.invoke[0].skip_instant_alerts, true);
    assertStrictEquals(calls.invoke[0].preview_only, true);
    assertEquals(calls.claim, [PULSE_REFRESH_MIN_INTERVAL_SECONDS]);
    assertEquals(calls.order, ["claim", "invoke", "loadPulse"]);
    assertStrictEquals(result.auto_refreshed, true);
    assertStrictEquals(result.refresh.status, "refreshed");
    assertStrictEquals(result.refresh.clients, 12);
    assertStrictEquals(
      result.refresh.previous_calculated_at,
      "2026-10-26T04:00:00Z",
    );
    assertStrictEquals(result.whatsapp_digest, "🟢 12 תקינים");
    assertStrictEquals(
      result.refresh_note,
      "🔄 רעננתי את בדיקת הדופק עכשיו (12:00).",
    );
    assertMatch(result.instructions_to_agent, /refresh_note/);
    assertMatch(result.instructions_to_agent, /הנחיית הדופק/);
  },
);

Deno.test(
  "a snapshot younger than 10 minutes is returned without a refresh",
  async () => {
    const { deps, calls } = fakeDeps({
      latestCalculatedAt: async () => "2026-10-26T09:55:00Z",
    });
    const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(calls.claim.length, 0);
    assertStrictEquals(calls.invoke.length, 0);
    assertStrictEquals(calls.loadPulse, 1);
    assertStrictEquals(result.auto_refreshed, false);
    assertStrictEquals(result.refresh.status, "fresh_snapshot");
    assertMatch(result.instructions_to_agent, /אל תטעני שהנתונים חושבו מחדש/);
  },
);

Deno.test(
  "a lost claim (another refresh in the last 10 minutes) returns the stored snapshot",
  async () => {
    const { deps, calls } = fakeDeps({ claimRefresh: async () => false });
    const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(calls.invoke.length, 0);
    assertStrictEquals(result.refresh.status, "rate_limited");
    assertStrictEquals(result.auto_refreshed, false);
    assertMatch(result.refresh_note, /רוענן בדקות האחרונות/);
  },
);

Deno.test(
  "without the claim RPC the tool fails closed and does not refresh",
  async () => {
    const { deps, calls } = fakeDeps({
      claimRefresh: async () => {
        throw new Error("function claim_campaign_pulse_refresh does not exist");
      },
    });
    const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(calls.invoke.length, 0);
    assertStrictEquals(result.refresh.status, "rate_limit_unavailable");
    assertStrictEquals(calls.loadPulse, 1);
  },
);

Deno.test(
  "the rate limit holds across calls: once per tenant per 10 minutes",
  async () => {
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
    assertStrictEquals(first.refresh.status, "refresh_failed");
    assertStrictEquals(first.refresh.error, "boom");
    clock += 5 * 60 * 1000;
    const second = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(second.refresh.status, "rate_limited");
    clock += 6 * 60 * 1000;
    const third = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(third.refresh.status, "refresh_failed");
    assertStrictEquals(invocations, 2);
  },
);

Deno.test(
  "a client the caller may not see is refused before anything runs",
  async () => {
    const { deps, calls } = fakeDeps({
      assertClientVisible: async () => {
        throw new Error("הלקוח לא משויך אליך");
      },
    });
    const result = await runCampaignPulseRefresh(
      { tenantId: TENANT, clientId: CLIENT },
      deps,
    );
    assertEquals(result, {
      error: "client_not_accessible",
      message: "הלקוח לא משויך אליך",
    });
    assertStrictEquals(calls.claim.length, 0);
    assertStrictEquals(calls.invoke.length, 0);
    assertStrictEquals(calls.loadPulse, 0);
  },
);

Deno.test(
  "a visible client is checked first and the refresh still covers only the caller's tenant",
  async () => {
    const { deps, calls } = fakeDeps();
    const result = await runCampaignPulseRefresh(
      { tenantId: TENANT, clientId: CLIENT },
      deps,
    );
    assertEquals(calls.assert, [CLIENT]);
    assertEquals(calls.order, ["assert", "claim", "invoke", "loadPulse"]);
    assertStrictEquals(calls.invoke[0].tenant_id, TENANT);
    assertStrictEquals(result.refresh.status, "refreshed");
  },
);

Deno.test("bad input never reaches the snapshot", async () => {
  const { deps, calls } = fakeDeps();
  assertStrictEquals(
    (await runCampaignPulseRefresh({ tenantId: "system" }, deps)).error,
    "tenant_required",
  );
  assertStrictEquals(
    (
      await runCampaignPulseRefresh(
        { tenantId: TENANT, clientId: "אלפא" },
        deps,
      )
    ).error,
    "invalid_client_id",
  );
  assertStrictEquals(
    calls.invoke.length + calls.claim.length + calls.loadPulse,
    0,
  );
});

Deno.test("snapshot answers are read per tenant", () => {
  assertEquals(
    interpretPulseSnapshotResponse(TENANT, {
      ok: true,
      body: { results: [{ tenant_id: TENANT, clients: 3 }] },
    }),
    { status: "refreshed", clients: 3 },
  );
  assertEquals(
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
  assertEquals(
    interpretPulseSnapshotResponse(TENANT, {
      ok: true,
      body: { success: true, results: [] },
    }),
    { status: "not_configured" },
  );
  assertEquals(
    interpretPulseSnapshotResponse(TENANT, {
      ok: false,
      status: 401,
      body: null,
    }),
    { status: "refresh_failed", error: "HTTP 401" },
  );
});

Deno.test("a timed-out snapshot call reports refresh_timeout", async () => {
  const { deps } = fakeDeps({
    invokeSnapshot: async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
  assertStrictEquals(result.refresh.status, "refresh_timeout");
  assertStrictEquals(result.auto_refreshed, false);
});

Deno.test("freshness decision and notes", () => {
  assertStrictEquals(
    decidePulseRefresh({
      lastCalculatedAt: "2026-10-26T09:51:00Z",
      now: NOW,
    }).refresh,
    false,
  );
  assertStrictEquals(
    decidePulseRefresh({ lastCalculatedAt: "2026-10-26T09:49:59Z", now: NOW })
      .refresh,
    true,
  );
  assertStrictEquals(
    decidePulseRefresh({ lastCalculatedAt: null, now: NOW }).refresh,
    true,
  );
  assertStrictEquals(
    buildPulseRefreshNote("fresh_snapshot", {
      // 25.10 is the first day after DST: 05:00 UTC is 07:00 in Israel.
      freshness: "2026-10-25T05:00:00Z",
      now: NOW,
    }),
    "⏱️ בדיקת הדופק כבר עדכנית, ולכן לא הרצתי אותה שוב. זו הבדיקה האחרונה שנשמרה (חושבה ב-25.10 07:00).",
  );
  assertMatch(
    buildPulseRefreshNote("not_configured", { freshness: null, now: NOW }),
    /לא מופעלת לארגון הזה.*אין בדיקת דופק שמורה/,
  );
});

Deno.test(
  "Supabase deps: tenant-scoped reads, the claim RPC and a service-role POST",
  async () => {
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
    assertStrictEquals(await deps.latestCalculatedAt(), "2026-10-26T04:00:00Z");
    assertEquals(queries[0].filters, [["tenant_id", TENANT]]);
    assertStrictEquals(queries[0].table, "campaign_pulse_snapshots");
    assertStrictEquals(await deps.claimRefresh(600), true);
    assertEquals(rpcs, [
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
    assertStrictEquals(response.ok, true);
    const [url, init] = fetched[0];
    assertStrictEquals(
      url,
      "https://example.supabase.co/functions/v1/campaign-pulse-snapshot",
    );
    assertStrictEquals(init.method, "POST");
    assertStrictEquals(init.headers.Authorization, "Bearer service-key");
    const body = JSON.parse(init.body);
    assertStrictEquals(body.deliver, false);
    assertStrictEquals(body.skip_instant_alerts, true);
    assertStrictEquals(body.tenant_id, TENANT);
    assert(init.signal, "the call has a timeout");
  },
);

Deno.test(
  "the snapshot's instant-alert gate stops on the refresh body",
  async () => {
    const { instantPulseAlertsGate } =
      await import("./pulse-instant-alerts.ts");
    const gate = instantPulseAlertsGate({
      campaignPulseEnabled: true,
      rules: { instant_wa_enabled: true },
      body: buildPulseRefreshRequestBody(TENANT),
    });
    assertEquals(gate, { run: false, reason: "skip_instant_alerts" });
  },
);

Deno.test(
  "an unidentified WhatsApp sender cannot refresh the tenant's pulse",
  async () => {
    const { deps, calls } = fakeDeps();
    // A client contact in a client group: no campaigner, no user.
    const result = await runCampaignPulseRefresh(
      { tenantId: TENANT, surface: "whatsapp" },
      deps,
    );
    assertStrictEquals(result.error, "caller_not_identified");
    assertMatch(result.message, /אנשי צוות/);
    assertStrictEquals(result.whatsapp_digest, undefined);
    assertStrictEquals(
      calls.assert.length +
        calls.claim.length +
        calls.invoke.length +
        calls.loadPulse,
      0,
    );
    for (const caller of [
      { callerCampaignerId: "c-1" },
      { callerUserId: "44444444-4444-4444-8444-444444444444" },
    ]) {
      assertStrictEquals(
        pulseRefreshCallerRefusal({ surface: "whatsapp", ...caller }),
        null,
      );
    }
    // Other surfaces resolve the caller from the signed-in user or the task.
    for (const surface of ["internal_chat", "task", "agent_direct", null]) {
      assertStrictEquals(pulseRefreshCallerRefusal({ surface }), null);
    }
    const campaigner = await runCampaignPulseRefresh(
      { tenantId: TENANT, surface: "whatsapp", callerCampaignerId: "c-1" },
      deps,
    );
    assertStrictEquals(campaigner.refresh.status, "refreshed");
  },
);

Deno.test(
  "a lost claim without a newer snapshot does not claim the pulse was refreshed",
  async () => {
    // The claim is taken before the snapshot runs. If that run failed or is
    // still going, the stored pulse is older than the interval.
    const { deps } = fakeDeps({
      claimRefresh: async () => false,
      loadPulse: async () => ({ count: 3, freshness: "2026-10-26T04:00:00Z" }),
    });
    const result = await runCampaignPulseRefresh({ tenantId: TENANT }, deps);
    assertStrictEquals(result.refresh.status, "rate_limited");
    assertStrictEquals(
      result.refresh_note,
      "⏱️ רענון של הדופק כבר הופעל בדקות האחרונות ועדיין לא נשמרה בדיקה חדשה; אפשר לנסות שוב בעוד כמה דקות. זו הבדיקה האחרונה שנשמרה (חושבה ב-06:00).",
    );
    assertStrictEquals(
      buildPulseRefreshNote("rate_limited", {
        freshness: "2026-10-26T09:58:00Z",
        now: NOW,
      }),
      "⏱️ הדופק רוענן בדקות האחרונות; אפשר לרענן שוב בעוד כמה דקות. זו הבדיקה האחרונה שנשמרה (חושבה ב-11:58).",
    );
  },
);

Deno.test(
  "an empty pulse after a refresh does not repeat the 'never create a check' rule",
  async () => {
    const empty = {
      count: 0,
      freshness: null,
      whatsapp_digest: null,
      instructions_to_agent:
        "לא נמצא Snapshot שמור. אמרי שאין בדיקת דופק זמינה. אסור ליצור בדיקה חדשה, להריץ כלי חלופי או להמציא נתונים.",
    };
    const refreshed = await runCampaignPulseRefresh(
      { tenantId: TENANT },
      fakeDeps({ loadPulse: async () => ({ ...empty }) }).deps,
    );
    assertStrictEquals(refreshed.refresh.status, "refreshed");
    assert(!refreshed.instructions_to_agent.includes("אסור ליצור בדיקה חדשה"));
    assertMatch(refreshed.instructions_to_agent, /הרענון רץ, אבל לא נמצאה/);
    const notConfigured = await runCampaignPulseRefresh(
      { tenantId: TENANT },
      fakeDeps({
        invokeSnapshot: async () => ({
          ok: true,
          status: 200,
          body: { results: [] },
        }),
        loadPulse: async () => ({ ...empty }),
      }).deps,
    );
    assertStrictEquals(notConfigured.refresh.status, "not_configured");
    assert(
      !notConfigured.instructions_to_agent.includes("אסור ליצור בדיקה חדשה"),
    );
    assertMatch(notConfigured.instructions_to_agent, /אין בדיקת דופק שמורה/);
  },
);

Deno.test(
  "Supabase deps: a client must sit in an accessible tenant and pass the caller scope",
  async () => {
    const lookups = [];
    const scopeChecks = [];
    const makeSupabase = (client) => ({
      from(table) {
        const q = { table, eq: [], in: [] };
        lookups.push(q);
        const chain = {
          select: () => chain,
          eq: (column, value) => (q.eq.push([column, value]), chain),
          in: (column, values) => (q.in.push([column, values]), chain),
          maybeSingle: async () => ({ data: client, error: null }),
        };
        return chain;
      },
    });
    const accessibleTenantIds = [TENANT, OTHER_TENANT];
    const visible = createPulseRefreshDeps({
      supabase: makeSupabase({ id: CLIENT }),
      tenantId: TENANT,
      accessibleTenantIds,
      assertCallerCanAccessClient: async (clientId) => {
        scopeChecks.push(clientId);
      },
    });
    await visible.assertClientVisible(CLIENT);
    assertStrictEquals(lookups[0].table, "clients");
    assertEquals(lookups[0].eq, [["id", CLIENT]]);
    assertEquals(lookups[0].in, [["tenant_id", accessibleTenantIds]]);
    assertEquals(scopeChecks, [CLIENT]);

    // A campaigner's scope check refuses a client that is not theirs.
    const notMine = createPulseRefreshDeps({
      supabase: makeSupabase({ id: CLIENT }),
      tenantId: TENANT,
      accessibleTenantIds,
      assertCallerCanAccessClient: async () => {
        throw new Error("הלקוח לא משויך אליך");
      },
    });
    const refused = await runCampaignPulseRefresh(
      { tenantId: TENANT, clientId: CLIENT },
      { ...fakeDeps().deps, assertClientVisible: notMine.assertClientVisible },
    );
    assertEquals(refused, {
      error: "client_not_accessible",
      message: "הלקוח לא משויך אליך",
    });

    // A client outside every accessible tenant never reaches the scope check.
    scopeChecks.length = 0;
    const missing = createPulseRefreshDeps({
      supabase: makeSupabase(null),
      tenantId: TENANT,
      accessibleTenantIds,
      assertCallerCanAccessClient: async (clientId) => {
        scopeChecks.push(clientId);
      },
    });
    let message = null;
    try {
      await missing.assertClientVisible(CLIENT);
    } catch (error) {
      message = error.message;
    }
    assertStrictEquals(message, "הלקוח לא נמצא או מחוץ להרשאה שלך");
    assertEquals(scopeChecks, []);

    // Without a scope check the client is refused, never allowed by default.
    const unchecked = createPulseRefreshDeps({
      supabase: makeSupabase({ id: CLIENT }),
      tenantId: TENANT,
    });
    let uncheckedError = null;
    try {
      await unchecked.assertClientVisible(CLIENT);
    } catch (error) {
      uncheckedError = error;
    }
    assert(uncheckedError, "missing scope check refuses");
  },
);

Deno.test("the WhatsApp refresh reply is the note, then the digest", () => {
  assertStrictEquals(
    buildPulseRefreshDigestReply({
      refresh_note: " 🔄 רעננתי את בדיקת הדופק עכשיו (12:00). ",
      whatsapp_digest: "🟢 12 תקינים\n",
    }),
    "🔄 רעננתי את בדיקת הדופק עכשיו (12:00).\n\n🟢 12 תקינים",
  );
  assertStrictEquals(
    buildPulseRefreshDigestReply({ whatsapp_digest: "🟢 12 תקינים" }),
    "🟢 12 תקינים",
  );
  // No digest (refused caller, empty pulse, tool error): no shortcut.
  for (const result of [
    { error: "caller_not_identified", message: "x" },
    { refresh_note: "⚠️", whatsapp_digest: null },
    { refresh_note: "⚠️", whatsapp_digest: "   " },
    null,
  ]) {
    assertStrictEquals(buildPulseRefreshDigestReply(result), null);
  }
});
