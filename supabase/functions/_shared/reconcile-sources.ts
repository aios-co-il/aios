/**
 * Platform sources for the reconciliation core: Meta Graph insights
 * (campaign level, time_increment=1) and Google Ads GAQL (segments.date).
 *
 * Both read only. `fetch`, `sleep` and the credentials are injected so tests can
 * replay recorded responses. Every request takes one unit of the call budget;
 * rate-limit answers are retried with backoff, then surface as a typed error.
 */
import {
  buildCampaignOptimizationGoalMap,
  buildInsightRecord,
  buildResultLeadTypeMap,
  buildResultMetricMaps,
  type CampaignStatus,
} from "./fbInsights.ts";
import {
  type AccountInfo,
  type CallBudget,
  type CampaignDayRow,
  type PlatformSource,
  type ReconcileTable,
  ReconcileSourceError,
  type SourceErrorKind,
} from "./reconcile-core.ts";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const RATE_LIMIT_RETRIES = 2;
export const BACKOFF_BASE_MS = 2000;

// ── Meta ───────────────────────────────────────────────────────────────────

export const META_GRAPH_VERSION = "v21.0";
const META_RATE_LIMIT_CODES = new Set([
  4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009,
  80014,
]);
const META_AUTH_CODES = new Set([102, 190, 463, 467]);

/** Classify a Graph API error body / HTTP status. */
export function classifyMetaError(
  status: number,
  error: { code?: number; type?: string; error_subcode?: number } | null,
): SourceErrorKind {
  const code = Number(error?.code);
  if (status === 429 || META_RATE_LIMIT_CODES.has(code)) return "rate_limit";
  if (
    status === 401 ||
    META_AUTH_CODES.has(code) ||
    code === 10 ||
    (code >= 200 && code < 300)
  )
    return "auth";
  return "platform";
}

/** `act_<id>` form the Graph API expects. */
export function metaAccountPath(raw: unknown): string | null {
  const id = String(raw || "").trim();
  if (!id) return null;
  return id.startsWith("act_") ? id : `act_${id}`;
}

type MetaRequestOptions = {
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
};

/** One Graph GET with backoff on rate limits; throws a typed, redacted error. */
async function metaGetJson(
  url: string,
  opts: MetaRequestOptions,
): Promise<any> {
  const doFetch: FetchLike = opts.fetch || ((u, i) => fetch(u, i));
  const sleep = opts.sleep || defaultSleep;
  for (let attempt = 0; ; attempt++) {
    opts.budget.take();
    let res: Response;
    try {
      res = await doFetch(url);
    } catch (err) {
      throw new ReconcileSourceError(
        "platform",
        `Meta request failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    const body: any = await res.json().catch(() => null);
    if (res.ok && body && !body.error) return body;
    const kind = classifyMetaError(res.status, body?.error || null);
    if (kind === "rate_limit" && attempt < RATE_LIMIT_RETRIES) {
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
      continue;
    }
    throw new ReconcileSourceError(
      kind,
      `Meta ${res.status}: ${body?.error?.message || "request failed"}`,
    );
  }
}

/** Follow `paging.next` up to `maxPages` pages. */
async function metaGetPaged(
  firstUrl: string,
  opts: MetaRequestOptions & { maxPages: number },
): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = firstUrl;
  let pages = 0;
  while (next) {
    if (pages >= opts.maxPages)
      throw new ReconcileSourceError(
        "platform",
        `Meta paging exceeded ${opts.maxPages} pages`,
      );
    const page = await metaGetJson(next, opts);
    pages += 1;
    if (Array.isArray(page.data)) rows.push(...page.data);
    next = typeof page.paging?.next === "string" ? page.paging.next : null;
  }
  return rows;
}

const META_INSIGHT_FIELDS =
  "campaign_id,campaign_name,impressions,reach,frequency,clicks,inline_link_clicks,cpm,ctr,actions,action_values,conversions,cost_per_action_type,cost_per_conversion,spend";

export type MetaSourceOptions = {
  getToken: (table: ReconcileTable) => Promise<string | null>;
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
  /** Cap on pages per edge, so one huge account cannot spend the whole budget. */
  maxPages?: number;
};

export function createMetaSource(opts: MetaSourceOptions): PlatformSource {
  const maxPages = opts.maxPages ?? 20;
  const tokens = new Map<string, string>();
  const request = { budget: opts.budget, fetch: opts.fetch, sleep: opts.sleep };
  const getJson = (url: string) => metaGetJson(url, request);
  const getPaged = (url: string) => metaGetPaged(url, { ...request, maxPages });

  const token = async (table: ReconcileTable) => {
    const cached = tokens.get(table.id);
    if (cached) return cached;
    const t = await opts.getToken(table);
    if (!t)
      throw new ReconcileSourceError("auth", "no active Meta connection token");
    tokens.set(table.id, t);
    return t;
  };

  const base = (path: string, params: Record<string, string>, t: string) =>
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${path}?` +
    new URLSearchParams({ ...params, access_token: t }).toString();

  return {
    name: "meta",
    async account(table) {
      const act = metaAccountPath(table.integration_settings?.ad_account_id);
      if (!act)
        throw new ReconcileSourceError("config", "no ad account on the table");
      const t = await token(table);
      const body = await getJson(
        base(act, { fields: "account_id,name,currency,timezone_name" }, t),
      );
      return {
        account_id: act,
        name: body.name || null,
        currency: body.currency || null,
        timezone: body.timezone_name || "UTC",
      } satisfies AccountInfo;
    },
    async campaignDays(table, window, account) {
      const t = await token(table);
      const act = account.account_id;
      // Same inputs the syncs use (cron-sync-facebook-insights), so leads and
      // purchases are counted exactly the way the stored rows were.
      const campaigns = await getPaged(
        base(
          `${act}/campaigns`,
          {
            fields:
              "id,name,effective_status,configured_status,objective,updated_time",
            limit: "500",
          },
          t,
        ),
      );
      const statuses: Record<string, CampaignStatus> = {};
      const objectives: Record<string, string | null | undefined> = {};
      for (const c of campaigns) {
        statuses[c.id] = {
          id: c.id,
          name: c.name,
          effective_status: c.effective_status,
          configured_status: c.configured_status,
          objective: c.objective || null,
          updated_time: c.updated_time || null,
        };
        objectives[c.id] = c.objective || null;
      }
      const adsets = await getPaged(
        base(
          `${act}/adsets`,
          {
            fields: "id,campaign_id,optimization_goal,promoted_object",
            limit: "500",
          },
          t,
        ),
      );
      const insights = await getPaged(
        base(
          `${act}/insights`,
          {
            level: "campaign",
            fields: META_INSIGHT_FIELDS,
            time_range: JSON.stringify({
              since: window.start,
              until: window.end,
            }),
            time_increment: "1",
            use_unified_attribution_setting: "true",
            limit: "500",
          },
          t,
        ),
      );
      const leadTypes = buildResultLeadTypeMap(adsets, objectives);
      const goals = buildCampaignOptimizationGoalMap(adsets);
      const metrics = buildResultMetricMaps(adsets);
      const rows: CampaignDayRow[] = insights.map((insight) => {
        const record = buildInsightRecord(
          insight,
          statuses,
          leadTypes,
          goals,
          metrics,
        );
        return {
          campaign_id: String(record.campaign_id || ""),
          campaign_name: record.campaign_name || null,
          date: record.date,
          data: record as unknown as Record<string, unknown>,
        };
      });
      return { rows };
    },
  };
}

/** Meta ad accounts a token can see, with spend over the last 7 complete days. */
export async function listMetaAccountsWithSpend(opts: {
  token: string;
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
  maxPages?: number;
}): Promise<
  Array<{
    account_id: string;
    name: string | null;
    currency: string | null;
    spend_7d: number;
  }>
> {
  const accounts = await metaGetPaged(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?` +
      new URLSearchParams({
        // date_preset last_7d = the 7 complete days before today, in each
        // account's own time zone. One request per 100 accounts.
        fields: "account_id,name,currency,insights.date_preset(last_7d){spend}",
        limit: "100",
        access_token: opts.token,
      }).toString(),
    {
      budget: opts.budget,
      fetch: opts.fetch,
      sleep: opts.sleep,
      maxPages: opts.maxPages ?? 10,
    },
  );
  return accounts
    .map((acct: any) => {
      const spend = Number(acct?.insights?.data?.[0]?.spend || 0);
      return {
        account_id: metaAccountPath(acct.account_id || acct.id) || "",
        name: acct.name || null,
        currency: acct.currency || null,
        spend_7d: Number.isFinite(spend) ? spend : 0,
      };
    })
    .filter((a) => a.account_id);
}

// ── Google Ads ─────────────────────────────────────────────────────────────

export const GOOGLE_ADS_API_VERSION = "v23";

export type GoogleAuth = {
  accessToken: string;
  developerToken: string;
  loginCustomerId: string;
};

/** Classify a Google Ads REST error (searchStream returns an array or an object). */
export function classifyGoogleError(
  status: number,
  body: any,
): SourceErrorKind {
  const err = Array.isArray(body) ? body[0]?.error : body?.error;
  const st = String(err?.status || "");
  if (status === 429 || st === "RESOURCE_EXHAUSTED") return "rate_limit";
  if (
    status === 401 ||
    status === 403 ||
    st === "UNAUTHENTICATED" ||
    st === "PERMISSION_DENIED"
  )
    return "auth";
  return "platform";
}

/** Digits only, as the Google Ads API expects customer ids. */
export function googleCustomerId(raw: unknown): string | null {
  const id = String(raw || "").replace(/\D/g, "");
  return id || null;
}

export type GoogleSourceOptions = {
  getAuth: (table: ReconcileTable) => Promise<GoogleAuth>;
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
};

export function createGoogleSource(opts: GoogleSourceOptions): PlatformSource {
  const doFetch: FetchLike = opts.fetch || ((u, i) => fetch(u, i));
  const sleep = opts.sleep || defaultSleep;
  const auths = new Map<string, GoogleAuth>();

  const auth = async (table: ReconcileTable) => {
    const cached = auths.get(table.id);
    if (cached) return cached;
    const a = await opts.getAuth(table);
    auths.set(table.id, a);
    return a;
  };

  async function search(
    table: ReconcileTable,
    customerId: string,
    query: string,
  ): Promise<any[]> {
    const a = await auth(table);
    for (let attempt = 0; ; attempt++) {
      opts.budget.take();
      let res: Response;
      try {
        res = await doFetch(
          `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${a.accessToken}`,
              "developer-token": a.developerToken,
              "login-customer-id": a.loginCustomerId,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
          },
        );
      } catch (err) {
        throw new ReconcileSourceError(
          "platform",
          `Google Ads request failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      const text = await res.text();
      let body: any = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      const hasError =
        !res.ok ||
        !body ||
        body.error ||
        (Array.isArray(body) && body.some((b: any) => b?.error));
      if (!hasError) {
        const batches = Array.isArray(body) ? body : [body];
        return batches.flatMap((b: any) => b?.results || []);
      }
      const kind = classifyGoogleError(res.status, body);
      if (kind === "rate_limit" && attempt < RATE_LIMIT_RETRIES) {
        await sleep(BACKOFF_BASE_MS * 2 ** attempt);
        continue;
      }
      const err = Array.isArray(body) ? body[0]?.error : body?.error;
      throw new ReconcileSourceError(
        kind,
        `Google Ads ${res.status}: ${err?.message || "request failed"}`,
      );
    }
  }

  return {
    name: "google",
    async account(table) {
      const customerId = googleCustomerId(
        table.integration_settings?.customer_id,
      );
      if (!customerId)
        throw new ReconcileSourceError(
          "config",
          "no Google Ads customer on the table",
        );
      const rows = await search(
        table,
        customerId,
        "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
      );
      const c = rows[0]?.customer || {};
      return {
        account_id: customerId,
        name: c.descriptiveName || null,
        currency: c.currencyCode || null,
        timezone: c.timeZone || "UTC",
      };
    },
    async campaignDays(table, window, account) {
      // Campaign level only, same metrics the sync stores (cost, conversions,
      // conversions_value). segments.date is in the customer's time zone.
      const rows = await search(
        table,
        account.account_id,
        `SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${window.start}' AND '${window.end}'`,
      );
      return {
        rows: rows.map((r: any) => {
          const data = {
            date: String(r.segments?.date || ""),
            entity_level: "campaign",
            campaign_id: String(r.campaign?.id || ""),
            campaign_name: String(r.campaign?.name || ""),
            cost: (parseInt(r.metrics?.costMicros || "0", 10) || 0) / 1_000_000,
            conversions: parseFloat(r.metrics?.conversions || "0") || 0,
            conversions_value:
              parseFloat(r.metrics?.conversionsValue || "0") || 0,
          };
          return {
            campaign_id: data.campaign_id,
            campaign_name: data.campaign_name || null,
            date: data.date,
            data,
          };
        }),
      };
    },
  };
}
