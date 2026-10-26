import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  PUBLIC_TABLE_SETTINGS_KEYS,
  toPublicCachedShareBody,
  toPublicTableSettings,
} from "./public-table-settings.ts";

/** Every integration_settings key read by SharedDashboard, SharedTable and their helpers. */
const SHARED_PAGE_KEYS = [
  "campaign_type",
  "currency",
  "default_report_mode",
  "use_woo_google_attribution",
  "shared_tabs",
  "sharedTabs",
  "targetDomain",
  "linkedGscLangFilter",
  "manual_roi",
  "pulse_campaign_goals",
];

const SECRET_VALUES = {
  webhook_secret: "SECRET-webhook-1",
  webhook_secret_token: "SECRET-zoom-2",
  access_token: "SECRET-access-3",
  refresh_token: "SECRET-refresh-4",
  api_key: "SECRET-apikey-5",
  apiKey: "SECRET-apikey-6",
  api_token: "SECRET-apitoken-7",
  bearer: "Bearer SECRET-bearer-8",
  authorization: "Bearer SECRET-auth-9",
  client_secret: "SECRET-client-10",
  openai_api_key: "SECRET-openai-11",
  google_api_key: "SECRET-google-12",
  inbound_secret: "SECRET-inbound-13",
  password: "SECRET-password-14",
  token: "SECRET-token-15",
  credentials: { private_key: "SECRET-private-16" },
  oauth: {
    access_token: "SECRET-nested-17",
    refresh_token: "SECRET-nested-18",
  },
};

/** Stored settings as a sync leaves them: display choices, sync metadata and credentials. */
function storedSettings(): Record<string, unknown> {
  return {
    ...SECRET_VALUES,
    campaign_type: "ecommerce",
    currency: "USD",
    default_report_mode: "leads",
    use_woo_google_attribution: false,
    shared_tabs: { seo: true, gsc: false, ga: "false", maskyoo: 0 },
    targetDomain: "example.co.il",
    linkedGscLangFilter: "he",
    manual_roi: { closures: 4, revenue: 12000, note: "SECRET-roi-19" },
    pulse_campaign_goals: { "123": "ecommerce", "Brand search": "leads" },
    ad_account_id: "act_1",
    customer_id: "111-222-3333",
    linkedGaTableId: "ga-table",
    linkedGscSiteUrl: "sc-domain:example.co.il",
    last_sync_at: "2026-10-25T10:00:00Z",
    last_sync_outcome: {
      status: "failed",
      error: "401 invalid token SECRET-err-20",
    },
    make_scenario_id: 42,
  };
}

/** Every planted credential value contains "SECRET"; none may survive. */
function assertNoSecrets(output: string) {
  assert(!output.includes("SECRET"), `leaked a credential: ${output}`);
  for (const key of [
    "webhook_secret",
    "access_token",
    "refresh_token",
    "api_key",
    "api_token",
    "bearer",
    "client_secret",
    "password",
    "credentials",
    "last_sync_outcome",
  ])
    assert(!output.includes(`"${key}"`), `leaked key ${key}`);
}

Deno.test("public settings keep exactly the keys the shared pages read", () => {
  assertEquals(
    [...PUBLIC_TABLE_SETTINGS_KEYS].sort(),
    [...SHARED_PAGE_KEYS].sort(),
  );

  const out = toPublicTableSettings(storedSettings());
  // Tables saved before shared_tabs existed keep their tab choices in sharedTabs.
  const legacy = toPublicTableSettings({ sharedTabs: { monthly_work: true } });
  assertEquals(
    [...Object.keys(out), ...Object.keys(legacy)].sort(),
    [...SHARED_PAGE_KEYS].sort(),
  );
  assertEquals(out, {
    campaign_type: "ecommerce",
    currency: "USD",
    default_report_mode: "leads",
    use_woo_google_attribution: false,
    shared_tabs: { seo: true, gsc: false, ga: "false", maskyoo: 0 },
    targetDomain: "example.co.il",
    linkedGscLangFilter: "he",
    manual_roi: { closures: 4, revenue: 12000 },
    pulse_campaign_goals: { "123": "ecommerce", "Brand search": "leads" },
  });
  assertEquals(legacy, { sharedTabs: { monthly_work: true } });
});

Deno.test("sharedTabs goes out only when shared_tabs is not stored", () => {
  const hideGa = { ga: false };
  const cases: [Record<string, unknown>, Record<string, unknown>][] = [
    [{ sharedTabs: hideGa }, { sharedTabs: hideGa }],
    [{ shared_tabs: null, sharedTabs: hideGa }, { sharedTabs: hideGa }],
    [
      { shared_tabs: { gsc: false }, sharedTabs: hideGa },
      { shared_tabs: { gsc: false } },
    ],
    // The shared page ignores these shapes and shows every tab; sharedTabs
    // must not take over once shared_tabs is dropped.
    [{ shared_tabs: ["seo"], sharedTabs: hideGa }, {}],
    [{ shared_tabs: "seo", sharedTabs: hideGa }, {}],
    [{ shared_tabs: false, sharedTabs: hideGa }, {}],
    [{ shared_tabs: 0, sharedTabs: hideGa }, {}],
  ];
  for (const [stored, expected] of cases)
    assertEquals(
      toPublicTableSettings(stored),
      expected,
      JSON.stringify(stored),
    );
});

Deno.test("credentials and sync errors never reach the public settings", () => {
  assertNoSecrets(JSON.stringify(toPublicTableSettings(storedSettings())));
});

Deno.test("an allowed key holding an object or long text is dropped", () => {
  const out = toPublicTableSettings({
    currency: { access_token: "SECRET-nested-21" },
    campaign_type: ["SECRET-array-22"],
    targetDomain: "x".repeat(300),
    default_report_mode: "ecommerce",
    shared_tabs: { seo: { token: "SECRET-tab-23" }, gsc: "SECRET-tab-24" },
    manual_roi: { closures: { api_key: "SECRET-roi-25" }, revenue: 1500 },
    pulse_campaign_goals: { "1": { secret: "SECRET-goal-26" }, "2": "leads" },
  });
  assertEquals(out, {
    default_report_mode: "ecommerce",
    shared_tabs: {},
    manual_roi: { revenue: 1500 },
    pulse_campaign_goals: { "2": "leads" },
  });
  assert(!JSON.stringify(out).includes("SECRET"));
});

Deno.test("missing or malformed settings give an empty object", () => {
  for (const input of [
    null,
    undefined,
    "settings",
    7,
    [],
    [{ currency: "USD" }],
  ])
    assertEquals(toPublicTableSettings(input), {});
  assertEquals(toPublicTableSettings({ manual_roi: null }), {});
  assertEquals(
    toPublicTableSettings({ manual_roi: { closures: null, revenue: null } }),
    { manual_roi: { closures: null, revenue: null } },
  );
});

Deno.test("a body cached before the allowlist goes out filtered", () => {
  const cached = JSON.stringify({
    table: {
      id: "t1",
      name: "SEO",
      integration_type: "ahrefs",
      integration_settings: storedSettings(),
    },
    ga_table: { id: "ga", name: "GA", integration_settings: storedSettings() },
    gsc_table: {
      id: "gsc",
      name: "GSC",
      integration_settings: storedSettings(),
    },
    ahrefs_reports: [{ id: "r1", domain: "example.co.il" }],
  });
  const body = toPublicCachedShareBody(cached);
  assert(body);
  assertNoSecrets(body);
  const payload = JSON.parse(body);
  assertEquals(payload.table.integration_settings.currency, "USD");
  assertEquals(
    payload.ga_table.integration_settings.campaign_type,
    "ecommerce",
  );
  assertEquals(payload.gsc_table.name, "GSC");
  assertEquals(payload.ahrefs_reports, [{ id: "r1", domain: "example.co.il" }]);
});

Deno.test("the live table settings replace the cached ones, filtered", () => {
  const cached = JSON.stringify({
    table: { id: "t1", integration_settings: { shared_tabs: { gsc: true } } },
  });
  const body = toPublicCachedShareBody(cached, {
    ...storedSettings(),
    shared_tabs: { gsc: false },
  });
  assert(body);
  assertNoSecrets(body);
  assertEquals(JSON.parse(body).table.integration_settings.shared_tabs, {
    gsc: false,
  });
});

Deno.test("a GSC-only cached body passes through unchanged", () => {
  const cached = JSON.stringify({
    gsc_records: [{ id: "1", data: { query: "q" } }],
    gsc_multi_period: null,
    gsc_synced_at: "2026-10-26T00:00:00Z",
  });
  assertStrictEquals(toPublicCachedShareBody(cached), cached);
});

Deno.test("an unreadable cached body is treated as a cache miss", () => {
  assertStrictEquals(toPublicCachedShareBody("{not json"), null);
  assertStrictEquals(toPublicCachedShareBody("[1,2]"), null);
  assertStrictEquals(toPublicCachedShareBody("null"), null);
});

/** Reads a share-link function's source next to this shared module. */
function functionSource(name: string): Promise<string> {
  return Deno.readTextFile(new URL(`../${name}/index.ts`, import.meta.url));
}

// The helper tests above pass even if a response stops calling the helper, so
// these read the functions themselves.
Deno.test(
  "share-link responses send table settings only through the allowlist",
  async () => {
    const responseSites = { "public-table": 4, "public-dashboard": 2 };
    for (const [name, expected] of Object.entries(responseSites)) {
      const source = await functionSource(name);
      const filteredNames = new Set(
        [
          ...source.matchAll(/const\s+(\w+)\s*=\s*toPublicTableSettings\(/g),
        ].map((match) => match[1]),
      );
      let checked = 0;
      for (const match of source.matchAll(
        /(\.update\(\{\s*)?\b(integration_settings|_integrationSettings)\s*:\s*([\w$.]+)(\()?/g,
      )) {
        const [site, dbWrite, , value, call] = match;
        if (dbWrite) continue;
        const filtered = call
          ? value === "toPublicTableSettings"
          : filteredNames.has(value);
        assert(filtered, `${name} returns unfiltered settings: ${site}`);
        checked++;
      }
      assert(
        checked >= expected,
        `${name}: found ${checked} settings response sites`,
      );
    }
  },
);

Deno.test(
  "public-table filters a cached share body before sending it",
  async () => {
    const source = await functionSource("public-table");
    const cached = source.match(
      /const\s+(\w+)\s*=\s*await\s+readSeoShareCache\(/,
    )?.[1];
    assert(cached, "public-table no longer reads the share cache this way");
    assert(
      new RegExp(`toPublicCachedShareBody\\(\\s*${cached}\\b`).test(source),
      "the cached body skips toPublicCachedShareBody",
    );
    assert(
      !new RegExp(`new Response\\(\\s*${cached}\\b`).test(source),
      "the cached body is sent as stored",
    );
  },
);
