import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  CallBudget,
  type CampaignDayRow,
  reconcileTable,
  type ReconcileTable,
  ReconcileSourceError,
} from "./reconcile-core.ts";
import {
  classifyMetaError,
  createGoogleSource,
  createMetaSource,
  listMetaAccountsWithSpend,
} from "./reconcile-sources.ts";

const TOKEN = "EAABrecordedtokenrecordedtoken123";

const metaTable: ReconcileTable = {
  id: "t-meta",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "1234" },
  last_sync_at: "2026-10-25T23:00:00Z",
};

type Recorded = { match: RegExp; status?: number; body: unknown };

/** Replays recorded responses in order per URL pattern and logs every request. */
function replay(recorded: Recorded[]) {
  const queue = [...recorded];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const i = queue.findIndex((r) => r.match.test(url));
    if (i < 0) throw new Error(`unexpected request ${url}`);
    const [hit] = queue.splice(i, 1);
    return Promise.resolve(
      new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 }),
    );
  };
  return { fetchFn, calls, left: () => queue.length };
}

const sleeps: number[] = [];
const sleep = (ms: number) => {
  sleeps.push(ms);
  return Promise.resolve();
};

// Recorded Graph responses (trimmed): an account in Israel time, two campaign
// pages, an ad set optimised for a custom pixel event, and insights across two
// pages with time_increment=1.
const META_ACCOUNT = {
  account_id: "1234",
  name: "Client Ads",
  currency: "ILS",
  timezone_name: "Asia/Jerusalem",
  id: "act_1234",
};
const META_CAMPAIGNS_1 = {
  data: [
    {
      id: "111",
      name: "לידים | אתר",
      objective: "OUTCOME_LEADS",
      effective_status: "ACTIVE",
      configured_status: "ACTIVE",
      updated_time: "2026-10-01T10:00:00+0300",
    },
  ],
  paging: {
    next: `https://graph.facebook.com/v21.0/act_1234/campaigns?after=c1&access_token=${TOKEN}`,
  },
};
const META_CAMPAIGNS_2 = {
  data: [
    {
      id: "222",
      name: "מכירות",
      objective: "OUTCOME_SALES",
      effective_status: "ACTIVE",
      configured_status: "ACTIVE",
    },
  ],
};
const META_ADSETS = {
  data: [
    {
      id: "a1",
      campaign_id: "111",
      optimization_goal: "OFFSITE_CONVERSIONS",
      promoted_object: {
        pixel_id: "p1",
        custom_event_type: "OTHER",
        custom_conversion_id: undefined,
        custom_event_str: "NewLead",
      },
    },
  ],
};
const insight = (
  campaign_id: string,
  date: string,
  spend: string,
  actions: Array<{ action_type: string; value: string }> = [],
  action_values: Array<{ action_type: string; value: string }> = [],
) => ({
  campaign_id,
  campaign_name: campaign_id === "111" ? "לידים | אתר" : "מכירות",
  date_start: date,
  date_stop: date,
  spend,
  impressions: "1000",
  clicks: "20",
  actions,
  action_values,
});
const META_INSIGHTS_1 = {
  data: [
    insight("111", "2026-10-19", "120.50", [
      { action_type: "offsite_conversion.fb_pixel_custom.NewLead", value: "4" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "9" },
    ]),
  ],
  paging: {
    next: `https://graph.facebook.com/v21.0/act_1234/insights?after=i1&access_token=${TOKEN}`,
  },
};
const META_INSIGHTS_2 = {
  data: [
    insight(
      "222",
      "2026-10-25",
      "300",
      [{ action_type: "omni_purchase", value: "3" }],
      [{ action_type: "omni_purchase", value: "900" }],
    ),
  ],
};

function metaRecording(extra: Recorded[] = []) {
  return replay([
    ...extra,
    { match: /\/act_1234\?/, body: META_ACCOUNT },
    { match: /\/campaigns\?(?!after)/, body: META_CAMPAIGNS_1 },
    { match: /\/campaigns\?after=c1/, body: META_CAMPAIGNS_2 },
    { match: /\/adsets\?/, body: META_ADSETS },
    { match: /\/insights\?(?!after)/, body: META_INSIGHTS_1 },
    { match: /\/insights\?after=i1/, body: META_INSIGHTS_2 },
  ]);
}

Deno.test(
  "Meta: follows paging, asks for daily campaign rows, counts results like the sync",
  async () => {
    const rec = metaRecording();
    const budget = new CallBudget(50);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget,
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(metaTable);
    assertEquals(account, {
      account_id: "act_1234",
      name: "Client Ads",
      currency: "ILS",
      timezone: "Asia/Jerusalem",
    });
    const { rows } = await source.campaignDays(
      metaTable,
      { start: "2026-10-19", end: "2026-10-25" },
      account,
    );
    assertStrictEquals(rec.left(), 0);
    assertStrictEquals(budget.used, 6);
    const insightsUrl = new URL(
      rec.calls.find((c) => /\/insights\?level/.test(c.url))!.url,
    );
    assertStrictEquals(insightsUrl.searchParams.get("time_increment"), "1");
    assertStrictEquals(insightsUrl.searchParams.get("level"), "campaign");
    assertEquals(JSON.parse(insightsUrl.searchParams.get("time_range")!), {
      since: "2026-10-19",
      until: "2026-10-25",
    });
    const byId = Object.fromEntries(rows.map((r) => [r.campaign_id, r.data]));
    // The ad set's custom event is authoritative: 4 leads, not the broad 9.
    assertStrictEquals(byId["111"].leads, 4);
    assertStrictEquals(byId["111"].spend, 120.5);
    assertStrictEquals(byId["222"].purchases, 3);
    assertStrictEquals(byId["222"].purchase_value, 900);
  },
);

Deno.test("Meta: a rate limit backs off and retries", async () => {
  sleeps.length = 0;
  const rec = metaRecording([
    {
      match: /\/act_1234\?/,
      status: 400,
      body: { error: { code: 17, message: "User request limit reached" } },
    },
  ]);
  const budget = new CallBudget(50);
  const source = createMetaSource({
    getToken: () => Promise.resolve(TOKEN),
    budget,
    fetch: rec.fetchFn,
    sleep,
  });
  const account = await source.account(metaTable);
  assertStrictEquals(account.timezone, "Asia/Jerusalem");
  assertEquals(sleeps, [2000]);
  assertStrictEquals(budget.used, 2);
});

Deno.test(
  "Meta: a persistent rate limit becomes a rate_limit error",
  async () => {
    sleeps.length = 0;
    const limited = {
      match: /\/act_1234\?/,
      status: 400,
      body: {
        error: { code: 80004, message: "There have been too many calls" },
      },
    };
    const rec = replay([limited, limited, limited]);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(50),
      fetch: rec.fetchFn,
      sleep,
    });
    const err = await assertRejects(
      () => source.account(metaTable),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "rate_limit");
    assertEquals(sleeps, [2000, 4000]);
  },
);

Deno.test("Meta: error classification", () => {
  assertStrictEquals(classifyMetaError(400, { code: 190 }), "auth");
  assertStrictEquals(classifyMetaError(400, { code: 4 }), "rate_limit");
  assertStrictEquals(classifyMetaError(429, null), "rate_limit");
  assertStrictEquals(classifyMetaError(403, { code: 200 }), "auth");
  assertStrictEquals(classifyMetaError(500, { code: 1 }), "platform");
});

Deno.test(
  "Meta token error: the run fails with a redacted error and stores no findings",
  async () => {
    const rec = replay([
      {
        match: /\/act_1234\?/,
        status: 400,
        body: {
          error: {
            code: 190,
            type: "OAuthException",
            message: `Error validating access token: Session has expired. url=https://graph.facebook.com/v21.0/act_1234?access_token=${TOKEN}`,
          },
        },
      },
    ]);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(50),
      fetch: rec.fetchFn,
      sleep,
    });
    const result = await reconcileTable({
      table: metaTable,
      source,
      readAios: () => Promise.resolve([]),
      now: new Date("2026-10-26T01:30:00Z"),
    });
    assertStrictEquals(result.status, "failed");
    assertStrictEquals(result.error_kind, "auth");
    assertEquals(result.findings, []);
    assertFalse(JSON.stringify(result.summary).includes(TOKEN));
    assert(String(result.summary.error).includes("Session has expired"));
  },
);

Deno.test("Meta: no token is an auth failure", async () => {
  const source = createMetaSource({
    getToken: () => Promise.resolve(null),
    budget: new CallBudget(5),
    fetch: () => Promise.reject(new Error("must not call")),
  });
  const err = await assertRejects(
    () => source.account(metaTable),
    ReconcileSourceError,
  );
  assertStrictEquals(err.kind, "auth");
});

Deno.test(
  "budget: an exhausted budget stops before the next request",
  async () => {
    const rec = metaRecording();
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(3),
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(metaTable);
    const err = await assertRejects(
      () =>
        source.campaignDays(
          metaTable,
          { start: "2026-10-19", end: "2026-10-25" },
          account,
        ),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "budget");
  },
);

Deno.test(
  "Meta end to end: account-time-zone window, recorded rows vs stored rows",
  async () => {
    const rec = metaRecording();
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(50),
      fetch: rec.fetchFn,
      sleep,
    });
    const stored: CampaignDayRow[] = [
      {
        campaign_id: "111",
        campaign_name: "לידים | אתר",
        date: "2026-10-19",
        // Legacy row: no entity_level, one lead missing → within tolerance.
        data: {
          date: "2026-10-19",
          campaign_id: "111",
          spend: 120.5,
          leads: 3,
        },
      },
    ];
    // 01:30 UTC on Oct 26 is already Oct 26 in Israel; the sync ran after Oct 25 ended.
    const result = await reconcileTable({
      table: metaTable,
      source,
      readAios: (_t, start, end) => {
        assertEquals([start, end], ["2026-10-19", "2026-10-25"]);
        return Promise.resolve(stored);
      },
      now: new Date("2026-10-26T01:30:00Z"),
    });
    assertStrictEquals(result.status, "mismatch");
    assertEquals(
      result.findings.map((f) => [f.kind, f.date, f.platform_value]),
      [["missing_day", "2026-10-25", 300]],
    );
  },
);

// ── Google ────────────────────────────────────────────────────────────────

const googleTable: ReconcileTable = {
  id: "t-google",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "google_ads",
  integration_settings: { customer_id: "123-456-7890", manager_id: "999" },
};

const GOOGLE_AUTH = {
  accessToken: "ya29.recordedaccesstoken",
  developerToken: "dev-token",
  loginCustomerId: "999",
};

Deno.test(
  "Google: customer time zone, GAQL with segments.date, micros to currency",
  async () => {
    const rec = replay([
      {
        match: /searchStream/,
        body: [
          {
            results: [
              {
                customer: {
                  id: "1234567890",
                  descriptiveName: "Client",
                  currencyCode: "ILS",
                  timeZone: "Asia/Jerusalem",
                },
              },
            ],
          },
        ],
      },
      {
        match: /searchStream/,
        body: [
          {
            results: [
              {
                segments: { date: "2026-10-20" },
                campaign: { id: "55", name: "Search | Brand" },
                metrics: {
                  costMicros: "210500000",
                  conversions: 7.5,
                  conversionsValue: 0,
                },
              },
            ],
          },
          {
            results: [
              {
                segments: { date: "2026-10-21" },
                campaign: { id: "55", name: "Search | Brand" },
                metrics: { costMicros: "1000000", conversions: 0 },
              },
            ],
          },
        ],
      },
    ]);
    const source = createGoogleSource({
      getAuth: () => Promise.resolve(GOOGLE_AUTH),
      budget: new CallBudget(10),
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(googleTable);
    assertEquals(account, {
      account_id: "1234567890",
      name: "Client",
      currency: "ILS",
      timezone: "Asia/Jerusalem",
    });
    const { rows } = await source.campaignDays(
      googleTable,
      { start: "2026-10-19", end: "2026-10-25" },
      account,
    );
    const query = JSON.parse(String(rec.calls[1].init?.body)).query;
    assert(
      query.includes("segments.date BETWEEN '2026-10-19' AND '2026-10-25'"),
    );
    assert(query.includes("FROM campaign"));
    const headers = rec.calls[1].init?.headers as Record<string, string>;
    assertStrictEquals(headers["login-customer-id"], "999");
    assertEquals(
      rows.map((r) => [r.date, r.campaign_id, r.data.cost, r.data.conversions]),
      [
        ["2026-10-20", "55", 210.5, 7.5],
        ["2026-10-21", "55", 1, 0],
      ],
    );
  },
);

Deno.test(
  "Google: RESOURCE_EXHAUSTED retries, UNAUTHENTICATED is auth",
  async () => {
    sleeps.length = 0;
    const rec = replay([
      {
        match: /searchStream/,
        status: 429,
        body: [{ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }],
      },
      {
        match: /searchStream/,
        body: [
          { results: [{ customer: { timeZone: "UTC", currencyCode: "USD" } }] },
        ],
      },
    ]);
    const source = createGoogleSource({
      getAuth: () => Promise.resolve(GOOGLE_AUTH),
      budget: new CallBudget(10),
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(googleTable);
    assertStrictEquals(account.currency, "USD");
    assertEquals(sleeps, [2000]);

    const denied = replay([
      {
        match: /searchStream/,
        status: 401,
        body: {
          error: {
            status: "UNAUTHENTICATED",
            message:
              "Request had invalid authentication credentials. Bearer ya29.recordedaccesstoken",
          },
        },
      },
    ]);
    const deniedSource = createGoogleSource({
      getAuth: () => Promise.resolve(GOOGLE_AUTH),
      budget: new CallBudget(10),
      fetch: denied.fetchFn,
      sleep,
    });
    const err = await assertRejects(
      () => deniedSource.account(googleTable),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "auth");
    assertFalse(err.message.includes("ya29.recorded"));
  },
);

Deno.test(
  "Meta account list: pages through accounts with 7-day spend",
  async () => {
    const rec = replay([
      {
        match: /\/me\/adaccounts\?(?!after)/,
        body: {
          data: [
            {
              account_id: "1",
              name: "A",
              currency: "ILS",
              insights: { data: [{ spend: "500.5" }] },
            },
            { account_id: "2", name: "B", currency: "ILS" },
          ],
          paging: {
            next: `https://graph.facebook.com/v21.0/me/adaccounts?after=x&access_token=${TOKEN}`,
          },
        },
      },
      {
        match: /\/me\/adaccounts\?after=x/,
        body: {
          data: [
            {
              id: "act_3",
              name: "C",
              currency: "USD",
              insights: { data: [{ spend: "40" }] },
            },
          ],
        },
      },
    ]);
    const accounts = await listMetaAccountsWithSpend({
      token: TOKEN,
      budget: new CallBudget(5),
      fetch: rec.fetchFn,
      sleep,
    });
    assertEquals(accounts, [
      { account_id: "act_1", name: "A", currency: "ILS", spend_7d: 500.5 },
      { account_id: "act_2", name: "B", currency: "ILS", spend_7d: 0 },
      { account_id: "act_3", name: "C", currency: "USD", spend_7d: 40 },
    ]);
    const fields = new URL(rec.calls[0].url).searchParams.get("fields");
    assert(fields?.includes("insights.date_preset(last_7d){spend}"));
  },
);
