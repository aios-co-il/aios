import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildHealthWhatsAppDigest,
  buildPulseDashboardAbsoluteUrl,
  buildPulseCategoryDigestLines,
  buildPulseWhatsAppDigest,
  classifyCampaignPulseStatus,
  clientAdAccountIds,
  countPulseStatuses,
  countStoppedCampaignsByClient,
  effectiveIsEcommerce,
  normalizeAdAccountId,
  expandSnapshotToGoalRows,
  filterPulseRowsByClientIds,
  isPulseDeliveryExcludedPhone,
  isPulseDeliveryExcludedRecipient,
  pickFreshestTablePerPlatform,
  resolveLastSyncAt,
  isSyncStale,
  pulseSurfacePrefersWhatsAppDigest,
  selectPulseCriticalAlerts,
} from "./campaign-pulse.ts";

const NOW = Date.parse("2026-08-03T12:00:00.000Z");
const FRESH = "2026-08-03T10:00:00.000Z";
const DAY_OLD = "2026-08-02T12:30:00.000Z"; // ~23.5h — must NOT be stale (twice-daily cadence)
const STALE = "2026-07-20T08:00:00.000Z";
const VERY_OLD_COLUMN = "2026-03-27T04:00:00.000Z";

Deno.test("resolveLastSyncAt prefers freshest of column vs settings", () => {
  assertStrictEquals(
    resolveLastSyncAt({
      last_sync_at: VERY_OLD_COLUMN,
      integration_settings: { last_sync_at: FRESH },
    }),
    FRESH,
  );
  assertStrictEquals(
    resolveLastSyncAt({
      last_sync_at: null,
      integration_settings: { last_sync_at: STALE },
    }),
    STALE,
  );
  assertStrictEquals(
    resolveLastSyncAt({ last_sync_at: null, integration_settings: {} }),
    null,
  );
});

Deno.test("isSyncStale uses freshest timestamp", () => {
  assertStrictEquals(
    isSyncStale(
      {
        last_sync_at: VERY_OLD_COLUMN,
        integration_settings: { last_sync_at: FRESH },
      },
      NOW,
    ),
    false,
  );
  assertStrictEquals(
    isSyncStale(
      {
        last_sync_at: null,
        integration_settings: { last_sync_at: STALE },
      },
      NOW,
    ),
    true,
  );
});

Deno.test(
  "isSyncStale tolerates ~24h gap (twice-daily sync + morning race)",
  () => {
    assertStrictEquals(
      isSyncStale(
        {
          last_sync_at: DAY_OLD,
          integration_settings: {},
        },
        NOW,
      ),
      false,
    );
  },
);

Deno.test(
  "pickFreshestTablePerPlatform ignores abandoned Meta duplicate",
  () => {
    const picked = pickFreshestTablePerPlatform([
      {
        integration_type: "facebook_ecommerce",
        campaign_active: true,
        last_sync_at: null,
        integration_settings: { last_sync_at: STALE },
      },
      {
        integration_type: "facebook_insights",
        campaign_active: true,
        last_sync_at: FRESH,
        integration_settings: {},
      },
      {
        integration_type: "google_ads",
        campaign_active: true,
        last_sync_at: DAY_OLD,
        integration_settings: {},
      },
    ]);
    assertStrictEquals(picked.length, 2);
    assertStrictEquals(
      picked.find((t) => t.integration_type?.startsWith("facebook"))
        ?.integration_type,
      "facebook_insights",
    );
    assert(picked.some((t) => t.integration_type === "google_ads"));
  },
);

Deno.test(
  "fresh Meta sibling keeps platform healthy despite abandoned ecommerce row",
  () => {
    const result = classifyCampaignPulseStatus({
      activeTables: [
        {
          integration_type: "google_ads",
          campaign_active: true,
          last_sync_at: FRESH,
          integration_settings: {},
        },
        {
          integration_type: "facebook_insights",
          campaign_active: true,
          last_sync_at: FRESH,
          integration_settings: {},
        },
        {
          integration_type: "facebook_ecommerce",
          campaign_active: true,
          last_sync_at: null,
          integration_settings: { last_sync_at: STALE },
        },
      ],
      hasConfiguredCampaignTable: true,
      recentRecordCount: 20,
      isEcommerce: true,
      spend7: 900,
      leads7: 0,
      purchases7: 12,
      roas: 2.5,
      cplChangePct: null,
      nowMs: NOW,
    });
    assertStrictEquals(result.status, "healthy");
    assertEquals(result.stalePlatforms, []);
  },
);

Deno.test(
  "health WhatsApp digest is short counts + dashboard link (no per-client list)",
  () => {
    const digest = buildHealthWhatsAppDigest({
      activeConnections: 40,
      systemChecks: 8,
      okChecks: 7,
      issueCount: 18,
      dashboardUrl: buildPulseDashboardAbsoluteUrl("marketingcaptain"),
    });
    assertMatch(digest, /בדיקת תקינות מערכות וקמפיינים/);
    assertMatch(digest, /נמצאו 18 נקודות לטיפול/);
    assertMatch(
      digest,
      /https:\/\/aios\.co\.il\/t\/marketingcaptain\/dmm-dashboard/,
    );
    assertStrictEquals(digest.includes("ארבע על ארבע"), false);
    assertStrictEquals(digest.includes("בילבי"), false);
    assertStrictEquals(digest.includes("Meta:"), false);
    assertStrictEquals(digest.includes("לא בוואטסאפ"), false);
  },
);

Deno.test("effectiveIsEcommerce follows facebook_ecommerce tables", () => {
  assertStrictEquals(
    effectiveIsEcommerce(false, [
      { integration_type: "google_ads", campaign_active: true },
    ]),
    false,
  );
  assertStrictEquals(
    effectiveIsEcommerce(false, [
      { integration_type: "facebook_ecommerce", campaign_active: true },
    ]),
    true,
  );
  assertStrictEquals(
    effectiveIsEcommerce(false, [
      { integration_type: "facebook_ecommerce", campaign_active: false },
    ]),
    false,
  );
  assertStrictEquals(effectiveIsEcommerce(true, []), true);
});

Deno.test(
  "connected client with no recent rows is warning/stale, not no_data",
  () => {
    const result = classifyCampaignPulseStatus({
      activeTables: [
        {
          integration_type: "facebook_ecommerce",
          campaign_active: true,
          last_sync_at: null,
          integration_settings: { last_sync_at: STALE },
        },
      ],
      hasConfiguredCampaignTable: true,
      recentRecordCount: 0,
      isEcommerce: true,
      spend7: 0,
      leads7: 0,
      purchases7: 0,
      roas: null,
      cplChangePct: null,
      nowMs: NOW,
    });
    assertStrictEquals(result.status, "warning");
    assert(result.flags.some((flag) => flag.includes("סנכרון ישן או חסר")));
    assertEquals(result.stalePlatforms, ["Meta"]);
  },
);

Deno.test("missing campaign table is no_data", () => {
  const result = classifyCampaignPulseStatus({
    activeTables: [],
    hasConfiguredCampaignTable: false,
    recentRecordCount: 0,
    isEcommerce: false,
    spend7: 0,
    leads7: 0,
    purchases7: 0,
    roas: null,
    cplChangePct: null,
    nowMs: NOW,
  });
  assertStrictEquals(result.status, "no_data");
  assertEquals(result.flags, ["אין טבלת קמפיין מחוברת"]);
});

Deno.test(
  "ecommerce spend without purchases is critical (not lead CPL)",
  () => {
    const result = classifyCampaignPulseStatus({
      activeTables: [
        {
          integration_type: "facebook_ecommerce",
          campaign_active: true,
          last_sync_at: FRESH,
          integration_settings: {},
        },
      ],
      hasConfiguredCampaignTable: true,
      recentRecordCount: 10,
      isEcommerce: true,
      spend7: 200,
      leads7: 0,
      purchases7: 0,
      roas: null,
      cplChangePct: null,
      nowMs: NOW,
    });
    assertStrictEquals(result.status, "critical");
    assertEquals(result.flags, ["הוצאה ללא רכישות"]);
  },
);

Deno.test(
  "fresh google sync with metrics stays healthy even if column is old",
  () => {
    const result = classifyCampaignPulseStatus({
      activeTables: [
        {
          integration_type: "google_ads",
          campaign_active: true,
          last_sync_at: VERY_OLD_COLUMN,
          integration_settings: { last_sync_at: FRESH },
        },
      ],
      hasConfiguredCampaignTable: true,
      recentRecordCount: 8,
      isEcommerce: false,
      spend7: 900,
      leads7: 10,
      purchases7: 0,
      roas: null,
      cplChangePct: 5,
      nowMs: NOW,
    });
    assertStrictEquals(result.status, "healthy");
    assertEquals(result.flags, []);
  },
);

Deno.test("stale platform on otherwise healthy client becomes warning", () => {
  const result = classifyCampaignPulseStatus({
    activeTables: [
      {
        integration_type: "google_ads",
        campaign_active: true,
        last_sync_at: FRESH,
        integration_settings: {},
      },
      {
        integration_type: "facebook_ecommerce",
        campaign_active: true,
        last_sync_at: null,
        integration_settings: { last_sync_at: STALE },
      },
    ],
    hasConfiguredCampaignTable: true,
    recentRecordCount: 20,
    isEcommerce: true,
    spend7: 900,
    leads7: 0,
    purchases7: 12,
    roas: 2.5,
    cplChangePct: null,
    nowMs: NOW,
  });
  assertStrictEquals(result.status, "warning");
  assert(result.flags.some((flag) => flag.includes("Meta")));
});

Deno.test(
  "client without a documented call in 14 days stays healthy (call is a separate indicator)",
  () => {
    const result = classifyCampaignPulseStatus({
      activeTables: [
        {
          integration_type: "facebook_insights",
          campaign_active: true,
          last_sync_at: FRESH,
          integration_settings: {},
        },
      ],
      hasConfiguredCampaignTable: true,
      recentRecordCount: 20,
      isEcommerce: false,
      spend7: 900,
      leads7: 10,
      purchases7: 0,
      roas: null,
      cplChangePct: 5,
      lastClientCallAt: "2026-07-15T12:00:00.000Z",
      nowMs: NOW,
    });
    assertStrictEquals(result.status, "healthy");
    assertEquals(result.flags, []);
  },
);

Deno.test("client call within 14 days keeps healthy campaign healthy", () => {
  const result = classifyCampaignPulseStatus({
    activeTables: [
      {
        integration_type: "facebook_insights",
        campaign_active: true,
        last_sync_at: FRESH,
        integration_settings: {},
      },
    ],
    hasConfiguredCampaignTable: true,
    recentRecordCount: 20,
    isEcommerce: false,
    spend7: 900,
    leads7: 10,
    purchases7: 0,
    roas: null,
    cplChangePct: 5,
    lastClientCallAt: "2026-07-25T12:00:00.000Z",
    nowMs: NOW,
  });
  assertStrictEquals(result.status, "healthy");
  assertEquals(result.flags, []);
});

Deno.test("client with no documented call keeps its performance status", () => {
  const result = classifyCampaignPulseStatus({
    activeTables: [
      {
        integration_type: "google_ads",
        campaign_active: true,
        last_sync_at: FRESH,
        integration_settings: {},
      },
    ],
    hasConfiguredCampaignTable: true,
    recentRecordCount: 20,
    isEcommerce: false,
    spend7: 900,
    leads7: 10,
    purchases7: 0,
    roas: null,
    cplChangePct: 5,
    lastClientCallAt: null,
    nowMs: NOW,
  });
  assertStrictEquals(result.status, "healthy");
  assertEquals(result.flags, []);
});

Deno.test("stopped campaign makes the client critical", () => {
  const result = classifyCampaignPulseStatus({
    activeTables: [
      {
        integration_type: "facebook_insights",
        campaign_active: true,
        last_sync_at: FRESH,
        integration_settings: {},
      },
    ],
    hasConfiguredCampaignTable: true,
    recentRecordCount: 20,
    isEcommerce: false,
    spend7: 900,
    leads7: 10,
    purchases7: 0,
    roas: null,
    cplChangePct: 5,
    stoppedCampaignCount: 2,
    nowMs: NOW,
  });
  assertStrictEquals(result.status, "critical");
  assert(result.flags.includes("2 קמפיינים נעצרו"));
});

Deno.test(
  "critical alerts attach only to clients with an active campaign table",
  () => {
    const clients = [
      {
        clientId: "client-active",
        clientName: "בילבי",
        adAccountIds: ["111"],
        hasActiveCampaignTable: true,
      },
      {
        clientId: "client-paused",
        clientName: "ארבע על ארבע",
        adAccountIds: ["222"],
        hasActiveCampaignTable: false,
      },
    ];
    const issues = selectPulseCriticalAlerts(
      [
        // Meta's monitor records the ad account but no client_id.
        {
          alert_type: "campaign_stopped",
          severity: "critical",
          ad_account_id: "act_111",
          campaign_name: "לידים אוגוסט",
        },
        {
          alert_type: "campaign_stopped",
          severity: "critical",
          ad_account_id: "act_222",
          campaign_name: "קמפיין מושהה",
        },
        {
          alert_type: "frequency_high",
          severity: "info",
          ad_account_id: "act_111",
          campaign_name: "תדירות",
        },
        {
          alert_type: "campaign_stopped",
          severity: "critical",
          ad_account_id: "act_999",
          campaign_name: "לקוח לא ידוע",
        },
      ],
      clients,
    );

    assertStrictEquals(issues.length, 1);
    assertStrictEquals(issues[0].clientName, "בילבי");
    assertStrictEquals(issues[0].label, "קמפיין נעצר");
    assertStrictEquals(issues[0].campaignName, "לידים אוגוסט");
    assertStrictEquals(
      countStoppedCampaignsByClient(issues).get("client-active"),
      1,
    );
  },
);

Deno.test("critical alerts appear in the WhatsApp digest", () => {
  const digest = buildPulseWhatsAppDigest(
    [{ status: "critical" }, { status: "healthy" }],
    "https://aios.co.il/t/dmm/dmm-dashboard",
    [
      {
        clientId: "a",
        clientName: "בילבי",
        alertType: "campaign_stopped",
        label: "קמפיין נעצר",
        campaignName: "לידים אוגוסט",
      },
      {
        clientId: "b",
        clientName: "ארבע על ארבע",
        alertType: "ad_disapproved",
        label: "מודעה נדחתה",
        campaignName: null,
      },
    ],
  );
  assertMatch(digest, /🔴 דורש טיפול:/);
  assertMatch(digest, /• בילבי: קמפיין נעצר — לידים אוגוסט/);
  assertMatch(digest, /• ארבע על ארבע: מודעה נדחתה/);
  assertStrictEquals(digest.includes("| סוכנות |"), false);
});

Deno.test("ad account ids are read from table settings and normalized", () => {
  assertStrictEquals(normalizeAdAccountId("act_123"), "123");
  assertStrictEquals(normalizeAdAccountId(" 456 "), "456");
  assertStrictEquals(normalizeAdAccountId(null), null);
  assertEquals(
    clientAdAccountIds([
      {
        integration_type: "facebook_insights",
        integration_settings: { ad_account_id: "act_111" },
      },
      {
        integration_type: "google_ads",
        integration_settings: { customer_id: "222" },
      },
      { integration_type: "facebook_ecommerce", integration_settings: {} },
    ]),
    ["111", "222"],
  );
});

Deno.test(
  "WhatsApp pulse digest is short counts + dashboard link (no markdown table)",
  () => {
    const digest = buildPulseWhatsAppDigest(
      [
        { status: "healthy" },
        { status: "warning" },
        { status: "no_data" },
        { status: "critical" },
      ],
      "https://aios.co.il/t/marketingcaptain/dmm-dashboard",
    );
    assertMatch(digest, /בדיקת דופק הושלמה/);
    assertMatch(digest, /🟢 \*1\* תקינים/);
    assertMatch(digest, /🟡 \*1\* במגמה שלילית/);
    assertMatch(digest, /🔴 \*1\* דורשים טיפול/);
    assertMatch(digest, /⚙️ \*1\* עם בעיית תפעול/);
    assertMatch(
      digest,
      /https:\/\/aios\.co\.il\/t\/marketingcaptain\/dmm-dashboard/,
    );
    assertStrictEquals(digest.includes("| סוכנות |"), false);
    assertStrictEquals(digest.includes("חושבה ב־"), false);
    assertStrictEquals(digest.includes("לא בוואטסאפ"), false);
    assertStrictEquals(digest.includes("בדשבורד בלבד"), false);
    assertStrictEquals(
      buildPulseWhatsAppDigest(
        [{ status: "healthy", client_name: "בילבי" }],
        "https://aios.co.il/t/marketingcaptain/dmm-dashboard",
      ).includes("בדשבורד בלבד"),
      false,
    );
    const counts = countPulseStatuses([
      { status: "healthy" },
      { status: "warning" },
      { status: "no_data" },
      { status: "critical" },
    ]);
    assertStrictEquals(counts.attention, 2);
    assertStrictEquals(pulseSurfacePrefersWhatsAppDigest("whatsapp"), true);
    assertStrictEquals(pulseSurfacePrefersWhatsAppDigest("task"), true);
    assertStrictEquals(
      pulseSurfacePrefersWhatsAppDigest("internal_chat"),
      false,
    );
  },
);

Deno.test("filterPulseRowsByClientIds keeps only assigned clients", () => {
  const rows = [
    { client_id: "a", status: "healthy", client_name: "Alpha" },
    { client_id: "b", status: "warning", client_name: "Beta" },
    { client_id: "c", status: "critical", client_name: "Gamma" },
  ];
  const filtered = filterPulseRowsByClientIds(rows, ["a", "c"]);
  assertStrictEquals(filtered.length, 2);
  assertEquals(
    filtered.map((row) => row.client_id),
    ["a", "c"],
  );

  const digest = buildPulseWhatsAppDigest(
    filtered,
    "https://aios.co.il/t/dmm/dmm-dashboard",
  );
  assertMatch(digest, /נבדקו 2 לקוחות/);
  assertMatch(digest, /https:\/\/aios\.co\.il\/t\/dmm\/dmm-dashboard/);
  assertStrictEquals(filterPulseRowsByClientIds(rows, []).length, 0);
});

Deno.test(
  "hybrid snapshot expands to separate lead and ecommerce goal rows",
  () => {
    const rows = expandSnapshotToGoalRows({
      client_id: "c1",
      client_name: "Hybrid Co",
      status: "warning",
      campaign_goal_mode: "hybrid",
      lead_spend_7d: 100,
      ecommerce_spend_7d: 200,
      leads_7d: 5,
      purchases_7d: 8,
      cpl_7d: 20,
      roas_7d: 2.5,
      cpl_change_pct: 10,
      roas_change_pct: -5,
      lead_goal_status: "warning",
      ecommerce_goal_status: "healthy",
    });
    assertStrictEquals(rows.length, 2);
    assertStrictEquals(rows[0].goal, "leads");
    assertStrictEquals(rows[1].goal, "ecommerce");
    assertStrictEquals(rows[0].efficiency_kind, "cpl");
    assertStrictEquals(rows[1].efficiency_kind, "roas");
  },
);

Deno.test("isPulseDeliveryExcludedRecipient blocks אילנית", () => {
  assertStrictEquals(isPulseDeliveryExcludedRecipient("אילנית"), true);
  assertStrictEquals(isPulseDeliveryExcludedRecipient("דנה"), false);
});

Deno.test(
  "isPulseDeliveryExcludedPhone is tenant-scoped (none blocked by default)",
  () => {
    assertStrictEquals(
      isPulseDeliveryExcludedPhone("972507677613", "dmm"),
      false,
    );
    assertStrictEquals(
      isPulseDeliveryExcludedPhone("0507677613", "dmm"),
      false,
    );
    assertStrictEquals(
      isPulseDeliveryExcludedPhone("972507677613", "marketingcaptain"),
      false,
    );
    assertStrictEquals(
      isPulseDeliveryExcludedPhone("972558833168", "dmm"),
      false,
    );
    assertStrictEquals(isPulseDeliveryExcludedPhone("972507677613"), false);
  },
);

Deno.test("category digest lines summarize the three campaign goals", () => {
  const lines = buildPulseCategoryDigestLines([
    {
      client_name: "לקוח א",
      campaign_breakdown: [
        {
          goal: "leads",
          status: "critical",
          alert_eligible: true,
          campaign_name: "לידים חורף",
          status_reason: "CPL ₪180 מול יעד ₪120 שבוע רצוף",
        },
        { goal: "leads", status: "healthy", campaign_name: "לידים קיץ" },
        { goal: "engagement", status: "warning", campaign_name: "מודעות שיחה" },
        { goal: "ecommerce", status: "healthy", campaign_name: "חנות" },
        { goal: "unknown", status: "no_data", campaign_name: "בלי סיווג" },
      ],
    },
  ]);

  assertMatch(lines.join("\n"), /לידים: 🔴 1 · 🟡 0 · 🟢 1 \(2 קמפיינים\)/);
  assertMatch(
    lines.join("\n"),
    /אינגייג׳מנט: 🔴 0 · 🟡 1 · 🟢 0 \(קמפיין אחד\)/,
  );
  assertMatch(lines.join("\n"), /איקומרס: 🔴 0 · 🟡 0 · 🟢 1/);
  assertMatch(lines.join("\n"), /טעונים סיווג: 1/);
  assertMatch(lines.join("\n"), /לקוח א — לידים חורף: CPL ₪180/);
});

Deno.test(
  "category digest stays empty for legacy snapshots without breakdown",
  () => {
    assertEquals(
      buildPulseCategoryDigestLines([
        { client_name: "לקוח", campaign_breakdown: null },
      ]),
      [],
    );
  },
);

Deno.test(
  "whatsapp digest names red clients and keeps the dashboard link last",
  () => {
    const digest = buildPulseWhatsAppDigest(
      [
        {
          client_id: "c1",
          client_name: "לקוח א",
          status: "critical",
          campaign_goal_mode: "leads",
          campaign_breakdown: [
            {
              goal: "leads",
              status: "critical",
              alert_eligible: true,
              campaign_name: "לידים חורף",
              status_reason: "הוצאה בלי תוצאות",
            },
          ],
        },
        {
          client_id: "c2",
          client_name: "לקוח ב",
          status: "healthy",
          campaign_goal_mode: "ecommerce",
          campaign_breakdown: [
            { goal: "ecommerce", status: "healthy", campaign_name: "חנות" },
          ],
        },
      ],
      "https://aios.co.il/t/dmm/dmm-dashboard",
    );

    // Multi-client digest lists the red client with its failing campaign (no category block).
    assertMatch(digest, /🔴 לקוח א — לידים חורף: הוצאה בלי תוצאות/);
    assertNotMatch(digest, /\|/);
    assert(digest.trim().endsWith("https://aios.co.il/t/dmm/dmm-dashboard"));
  },
);

Deno.test(
  "multi-client digest groups by agency and keeps call-log gaps out of the warnings",
  () => {
    const digest = buildPulseWhatsAppDigest(
      [
        {
          client_name: "Smart air",
          agency_name: "DMM-LTD",
          status: "critical",
          flags: ["הוצאה ללא רכישות"],
        },
        {
          client_name: "Detailit",
          agency_name: "DMM-LTD",
          status: "warning",
          flags: ["לא תועדה שיחה טלפונית עם הלקוח"],
        },
        {
          client_name: "בילבי",
          agency_name: "promo",
          status: "warning",
          flags: ["CPL עלה ב-40%"],
        },
        {
          client_name: "חדש",
          agency_name: "promo",
          status: "no_data",
          flags: ["אין טבלת קמפיין מחוברת"],
        },
      ],
      "https://aios.co.il/t/dmm/dmm-dashboard",
      [
        {
          clientId: "n",
          clientName: "נורית אלדר",
          alertType: "ad_disapproved",
          label: "מודעה נדחתה",
          campaignName: "א",
        },
        {
          clientId: "n",
          clientName: "נורית אלדר",
          alertType: "ad_disapproved",
          label: "מודעה נדחתה",
          campaignName: "ב",
        },
      ],
    );
    assertMatch(digest, /🔴 \*1\* דורשים טיפול/);
    assertMatch(digest, /🟡 \*1\* במגמה שלילית/);
    assertMatch(digest, /🟢 \*1\* תקינים/);
    assertMatch(digest, /⚙️ \*1\* עם בעיית תפעול/);
    assertMatch(digest, /📞 \*1\* ללא שיחה מתועדת/);
    assertMatch(digest, /\*DMM-LTD\* \(2\) — 🔴 1 · 🟡 0 · 🟢 1/);
    assertMatch(digest, /🔴 Smart air — הוצאה ללא רכישות/);
    assertMatch(digest, /\*promo\* \(2\) — 🔴 0 · 🟡 1 · 🟢 0/);
    assertMatch(digest, /• נורית אלדר: מודעה נדחתה ×2/);
  },
);
