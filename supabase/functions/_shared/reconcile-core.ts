/**
 * Nightly reconciliation of AIOS ad reports against Meta and Google (AIO-238).
 *
 * For one report table (facebook_insights, facebook_ecommerce or google_ads) this
 * compares the last complete days, ending yesterday in the ad account's own time
 * zone, campaign by campaign and day by day: spend, the primary result (leads,
 * purchases or conversions, by the campaign's goal) and revenue.
 *
 * Everything here is pure apart from the injected platform source and AIOS
 * reader, so the worker, Carmen's tools and the tests share one implementation.
 * The platform adapters live in reconcile-sources.ts and the database access in
 * reconcile-db.ts.
 */
import { isNonProductionAppEnv } from "./app-env.ts";
import { classifyPulseCampaignGoal } from "./pulse-campaign-goals.mjs";
import { shiftDateString } from "./report-sync-window.ts";

export const RECONCILE_INTEGRATION_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
] as const;
export type ReconcileIntegrationType =
  (typeof RECONCILE_INTEGRATION_TYPES)[number];
export type ReconcilePlatform = "meta" | "google";

export const RECONCILE_WINDOW_DAYS = 7;

/**
 * A difference counts as a mismatch only above max(pct × platform value, floor).
 * The money floor is in the ad account's currency. Result counts get a floor of
 * one: a single late-attributed lead is not a sync bug.
 */
export const RECONCILE_TOLERANCE = { pct: 0.02, money: 20, count: 1 } as const;
export type ReconcileTolerance = {
  pct: number;
  money: number;
  count: number;
};

/** Findings kept per table per run; the summary still counts every one. */
export const MAX_FINDINGS_PER_TABLE = 100;

export const FINDING_KINDS = [
  "mismatch",
  "missing_day",
  "missing_in_aios",
  "missing_on_platform",
  "unmapped_account",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export type RunStatus = "ok" | "mismatch" | "failed" | "skipped";

export type ReconcileTable = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  name?: string | null;
  integration_type: string;
  integration_settings?: Record<string, unknown> | null;
  category?: string | null;
  last_sync_at?: string | null;
};

/** One campaign × day row, either side. `data` is the stored/synced record shape. */
export type CampaignDayRow = {
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  data: Record<string, unknown>;
};

export type ReconcileFinding = {
  kind: FindingKind;
  campaign_id: string | null;
  date: string | null;
  metric: string | null;
  aios_value: number | null;
  platform_value: number | null;
  details: Record<string, unknown>;
};

export type AccountInfo = {
  account_id: string;
  timezone: string;
  currency: string | null;
  name?: string | null;
};

export type PlatformFetch = {
  rows: CampaignDayRow[];
};

/** Injectable source of platform truth (Meta Graph, Google GAQL or a fixture). */
export interface PlatformSource {
  readonly name: "meta" | "google" | "fixture";
  account(table: ReconcileTable): Promise<AccountInfo>;
  campaignDays(
    table: ReconcileTable,
    window: { start: string; end: string },
    account: AccountInfo,
  ): Promise<PlatformFetch>;
}

export type SourceErrorKind =
  "auth" | "rate_limit" | "platform" | "config" | "budget";

/**
 * How far a rate limit reaches: "account" throttles (Meta's per-ad-account
 * 80000-range codes) stop only that table; anything else stops the platform.
 */
export type RateLimitScope = "account" | "platform";

/** A platform failure with a kind the worker can act on. Messages are redacted. */
export class ReconcileSourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly scope: RateLimitScope;
  constructor(
    kind: SourceErrorKind,
    message: string,
    scope: RateLimitScope = "platform",
  ) {
    super(redactSecrets(message));
    this.name = "ReconcileSourceError";
    this.kind = kind;
    this.scope = scope;
  }
}

/** API calls allowed per worker invocation; every platform request takes one. */
export class CallBudget {
  used = 0;
  constructor(readonly limit: number) {}
  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }
  take(): void {
    if (this.used >= this.limit)
      throw new ReconcileSourceError("budget", "API call budget exhausted");
    this.used += 1;
  }
}

// ── Secrets ────────────────────────────────────────────────────────────────

const REDACTED = "[redacted]";
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(access[_-]token|refresh[_-]token|client[_-]secret|appsecret[_-]proof|developer[_-]token|api[_-]?key)(["']?\s*[:=]\s*["']?)(?!\[redacted\])[^&\s"',;)}\]]+/gi,
    `$1$2${REDACTED}`,
  ],
  [
    /(https?:\/\/[^\s?#"'<>()]+)\?(?!\[redacted\])[^\s"'<>)]*/gi,
    `$1?${REDACTED}`,
  ],
  [/\b(Bearer\s+)(?!\[redacted\])[\w.~+/=-]+/gi, `$1${REDACTED}`],
  [/(?<![A-Za-z0-9])EAA[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bya29\.[\w.-]+/g, REDACTED],
];

/** Error text with tokens and query strings removed, capped for storage. */
export function redactSecrets(text: unknown, max = 300): string {
  let out = String(text ?? "").replace(/%(2[26F]|3[ADF])/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  for (const [pattern, replacement] of SECRET_PATTERNS)
    out = out.replace(pattern, replacement);
  return out.slice(0, max);
}

// ── Dates in the account's time zone ───────────────────────────────────────

function validTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return null;
  }
}

/** Calendar date (yyyy-mm-dd) of `now` in `timeZone`. */
export function ymdInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant at which `ymd` starts in `timeZone`. */
export function zonedDayStart(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  let ts = naive - tzOffsetMs(naive, timeZone);
  ts = naive - tzOffsetMs(ts, timeZone);
  return new Date(ts);
}

export type ReconcileWindow = {
  start: string;
  end: string;
  dates: string[];
  today: string;
  timezone: string;
  timezone_fallback: boolean;
};

/** The `days` complete days ending yesterday in the account's time zone. */
export function completeDaysWindow(
  now: Date,
  timeZone: string | null | undefined,
  days = RECONCILE_WINDOW_DAYS,
): ReconcileWindow {
  const tz = validTimeZone(timeZone);
  const zone = tz || "UTC";
  const today = ymdInTimeZone(now, zone);
  const end = shiftDateString(today, -1);
  const start = shiftDateString(end, -(days - 1));
  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(shiftDateString(start, i));
  return {
    start,
    end,
    dates,
    today,
    timezone: zone,
    timezone_fallback: !tz,
  };
}

/** Freshest of the column and the settings mirror. */
export function tableLastSyncAt(table: ReconcileTable): string | null {
  const stamps = [
    table.last_sync_at,
    table.integration_settings?.last_sync_at as string | null | undefined,
  ].filter((s): s is string => typeof s === "string" && !!Date.parse(s));
  if (!stamps.length) return null;
  return stamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

/**
 * Yesterday counts only once a sync ran after it ended in the account's zone.
 * The nightly run starts before the morning sync, so without this every active
 * campaign would show yesterday's partial day as a mismatch. Older days are
 * always compared, so a stalled sync still shows up as missing days.
 *
 * Known sync gap, reported on purpose: the scheduled Meta insights sync
 * (cron-sync-facebook-insights) plans its window by Jerusalem date. For an
 * account far behind Jerusalem (America/*) the morning run stores that
 * account's yesterday while it is still running and the afternoon run starts
 * from the next day, so the day stays partial until the 3-day lookback
 * re-fetches it. Those stored rows really are short, so they show up as spend
 * mismatches until the sync plans by the account's own zone.
 */
export function pendingDates(
  window: ReconcileWindow,
  lastSyncAt: string | null,
): string[] {
  if (!lastSyncAt) return [];
  const dayEnd = zonedDayStart(
    shiftDateString(window.end, 1),
    window.timezone,
  ).getTime();
  return Date.parse(lastSyncAt) < dayEnd ? [window.end] : [];
}

// ── Metrics ────────────────────────────────────────────────────────────────

export function platformFor(integrationType: string): ReconcilePlatform | null {
  if (
    integrationType === "facebook_insights" ||
    integrationType === "facebook_ecommerce"
  )
    return "meta";
  if (integrationType === "google_ads") return "google";
  return null;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

type DayMetrics = {
  spend: number;
  leads: number;
  purchases: number;
  conversions: number;
  revenue: number;
};

/** Spend / results / revenue of one stored or platform record. */
export function recordMetrics(
  platform: ReconcilePlatform,
  data: Record<string, unknown>,
): DayMetrics {
  if (platform === "google") {
    return {
      spend: num(data.cost ?? data.spend),
      leads: 0,
      purchases: 0,
      conversions: num(data.conversions),
      revenue: num(data.conversions_value),
    };
  }
  return {
    spend: num(data.spend),
    leads: num(data.leads),
    purchases: num(data.purchases),
    conversions: 0,
    revenue: num(data.purchase_value),
  };
}

/** Which result metric is primary for this campaign, or null when it has none. */
export function primaryResultMetric(
  platform: ReconcilePlatform,
  sample: Record<string, unknown> | null,
  table: ReconcileTable,
): "leads" | "purchases" | "conversions" | null {
  if (platform === "google") return "conversions";
  const { goal } = classifyPulseCampaignGoal(sample || {}, {
    integration_type: table.integration_type,
    integration_settings: table.integration_settings || {},
    category: table.category || null,
  }) as { goal: string };
  if (goal === "ecommerce") return "purchases";
  if (goal === "leads") return "leads";
  return null;
}

/** Stored rows without entity_level are campaign rows (legacy syncs). */
export function isCampaignLevel(data: Record<string, unknown>): boolean {
  return String(data?.entity_level || "campaign").toLowerCase() === "campaign";
}

/** True when |aios − platform| exceeds max(pct × |platform|, floor). */
export function exceedsTolerance(
  aios: number,
  platform: number,
  unit: "money" | "count",
  tolerance: ReconcileTolerance = RECONCILE_TOLERANCE,
): boolean {
  const diff = Math.round(Math.abs(aios - platform) * 1e6) / 1e6;
  const floor = unit === "money" ? tolerance.money : tolerance.count;
  return diff > Math.max(Math.abs(platform) * tolerance.pct, floor);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type CampaignSide = {
  name: string | null;
  sample: Record<string, unknown> | null;
  days: Map<string, DayMetrics>;
};

function addDay(target: DayMetrics, add: DayMetrics) {
  target.spend += add.spend;
  target.leads += add.leads;
  target.purchases += add.purchases;
  target.conversions += add.conversions;
  target.revenue += add.revenue;
}

const zero = (): DayMetrics => ({
  spend: 0,
  leads: 0,
  purchases: 0,
  conversions: 0,
  revenue: 0,
});

function campaignKey(row: CampaignDayRow): string {
  const id = String(row.campaign_id || "").trim();
  if (id) return id;
  return `name:${String(row.campaign_name || "").trim()}`;
}

function groupByCampaign(
  platform: ReconcilePlatform,
  rows: CampaignDayRow[],
  dates: Set<string>,
): Map<string, CampaignSide> {
  const out = new Map<string, CampaignSide>();
  for (const row of rows) {
    if (!dates.has(row.date)) continue;
    if (!isCampaignLevel(row.data)) continue;
    const key = campaignKey(row);
    if (key === "name:") continue;
    const side = out.get(key) || {
      name: row.campaign_name,
      sample: null,
      days: new Map<string, DayMetrics>(),
    };
    side.name = side.name || row.campaign_name;
    if (!side.sample) side.sample = row.data;
    const day = side.days.get(row.date) || zero();
    addDay(day, recordMetrics(platform, row.data));
    side.days.set(row.date, day);
    out.set(key, side);
  }
  return out;
}

/** Legacy stored rows carry only a name: attach them to the platform id with that name. */
function rekeyNamedRows(
  aios: Map<string, CampaignSide>,
  platform: Map<string, CampaignSide>,
) {
  const idByName = new Map<string, string>();
  for (const [id, side] of platform)
    if (side.name) idByName.set(side.name.trim(), id);
  for (const key of [...aios.keys()]) {
    if (!key.startsWith("name:")) continue;
    const id = idByName.get(key.slice(5));
    if (!id) continue;
    const named = aios.get(key)!;
    const target = aios.get(id) || {
      name: named.name,
      sample: named.sample,
      days: new Map<string, DayMetrics>(),
    };
    for (const [date, metrics] of named.days) {
      const day = target.days.get(date) || zero();
      addDay(day, metrics);
      target.days.set(date, day);
    }
    aios.set(id, target);
    aios.delete(key);
  }
}

function sideTotal(side: CampaignSide | undefined, skip: Set<string>) {
  const total = zero();
  if (!side) return total;
  for (const [date, metrics] of side.days)
    if (!skip.has(date)) addDay(total, metrics);
  return total;
}

export type CompareResult = {
  findings: ReconcileFinding[];
  counts: Record<FindingKind, number>;
  totals: {
    aios: { spend: number; revenue: number };
    platform: { spend: number; revenue: number };
  };
  campaigns: { aios: number; platform: number; both: number };
  missing_dates: string[];
};

const FINDING_ORDER: Record<FindingKind, number> = {
  missing_day: 0,
  missing_in_aios: 1,
  missing_on_platform: 2,
  mismatch: 3,
  unmapped_account: 4,
};

/** Compare stored campaign days with the platform's for the given dates. */
export function compareCampaignDays(input: {
  table: ReconcileTable;
  platform: ReconcilePlatform;
  aiosRows: CampaignDayRow[];
  platformRows: CampaignDayRow[];
  dates: string[];
  tolerance?: ReconcileTolerance;
}): CompareResult {
  const tolerance = input.tolerance || RECONCILE_TOLERANCE;
  const dateSet = new Set(input.dates);
  const aios = groupByCampaign(input.platform, input.aiosRows, dateSet);
  const platform = groupByCampaign(input.platform, input.platformRows, dateSet);
  rekeyNamedRows(aios, platform);

  const findings: ReconcileFinding[] = [];

  // A day AIOS has no campaign rows for at all, while the platform spent.
  const aiosDates = new Set<string>();
  for (const side of aios.values())
    for (const date of side.days.keys()) aiosDates.add(date);
  const missingDates = new Set<string>();
  for (const date of input.dates) {
    if (aiosDates.has(date)) continue;
    let spend = 0;
    let campaigns = 0;
    for (const side of platform.values()) {
      const day = side.days.get(date);
      if (!day) continue;
      spend += day.spend;
      if (day.spend > 0) campaigns += 1;
    }
    if (!exceedsTolerance(0, spend, "money", tolerance)) continue;
    missingDates.add(date);
    findings.push({
      kind: "missing_day",
      campaign_id: null,
      date,
      metric: "spend",
      aios_value: 0,
      platform_value: round2(spend),
      details: { campaigns_with_spend: campaigns },
    });
  }

  const keys = new Set([...aios.keys(), ...platform.keys()]);
  let both = 0;
  for (const key of keys) {
    const a = aios.get(key);
    const p = platform.get(key);
    const name = p?.name || a?.name || null;
    const campaignId = key.startsWith("name:") ? null : key;
    if (a && p) both += 1;

    if (!a || !p) {
      const total = sideTotal(a || p, missingDates);
      const aiosValue = a ? total.spend : 0;
      const platformValue = p ? total.spend : 0;
      if (!exceedsTolerance(aiosValue, platformValue, "money", tolerance))
        continue;
      const days = [...(a || p)!.days.entries()]
        .filter(([date, m]) => !missingDates.has(date) && m.spend > 0)
        .map(([date]) => date)
        .sort();
      findings.push({
        kind: a ? "missing_on_platform" : "missing_in_aios",
        campaign_id: campaignId,
        date: null,
        metric: "spend",
        aios_value: round2(aiosValue),
        platform_value: round2(platformValue),
        details: { campaign_name: name, dates: days },
      });
      continue;
    }

    const resultMetric = primaryResultMetric(
      input.platform,
      p.sample || a.sample,
      input.table,
    );
    for (const date of input.dates) {
      if (missingDates.has(date)) continue;
      const ad = a.days.get(date);
      const pd = p.days.get(date);
      if (!ad && !pd) continue;
      const am = ad || zero();
      const pm = pd || zero();
      const checks: Array<[string, number, number, "money" | "count"]> = [
        ["spend", am.spend, pm.spend, "money"],
      ];
      if (resultMetric)
        checks.push([
          resultMetric,
          am[resultMetric],
          pm[resultMetric],
          "count",
        ]);
      if (am.revenue > 0 || pm.revenue > 0)
        checks.push(["revenue", am.revenue, pm.revenue, "money"]);
      for (const [metric, av, pv, unit] of checks) {
        if (!exceedsTolerance(av, pv, unit, tolerance)) continue;
        findings.push({
          kind: "mismatch",
          campaign_id: campaignId,
          date,
          metric,
          aios_value: round2(av),
          platform_value: round2(pv),
          details: {
            campaign_name: name,
            ...(ad ? {} : { aios_row_missing: true }),
            ...(pd ? {} : { platform_row_missing: true }),
          },
        });
      }
    }
  }

  findings.sort((x, y) => {
    const order = FINDING_ORDER[x.kind] - FINDING_ORDER[y.kind];
    if (order) return order;
    const dx = Math.abs((x.aios_value ?? 0) - (x.platform_value ?? 0));
    const dy = Math.abs((y.aios_value ?? 0) - (y.platform_value ?? 0));
    return dy - dx;
  });

  const counts = Object.fromEntries(FINDING_KINDS.map((k) => [k, 0])) as Record<
    FindingKind,
    number
  >;
  for (const f of findings) counts[f.kind] += 1;

  const totals = {
    aios: { spend: 0, revenue: 0 },
    platform: { spend: 0, revenue: 0 },
  };
  for (const side of aios.values()) {
    const t = sideTotal(side, new Set());
    totals.aios.spend += t.spend;
    totals.aios.revenue += t.revenue;
  }
  for (const side of platform.values()) {
    const t = sideTotal(side, new Set());
    totals.platform.spend += t.spend;
    totals.platform.revenue += t.revenue;
  }
  for (const side of [totals.aios, totals.platform]) {
    side.spend = round2(side.spend);
    side.revenue = round2(side.revenue);
  }

  return {
    findings,
    counts,
    totals,
    campaigns: { aios: aios.size, platform: platform.size, both },
    missing_dates: [...missingDates].sort(),
  };
}

// ── One table ──────────────────────────────────────────────────────────────

export type TableReconcileResult = {
  status: RunStatus;
  platform: ReconcilePlatform | null;
  window_start: string | null;
  window_end: string | null;
  findings: ReconcileFinding[];
  summary: Record<string, unknown>;
  /** Kind of failure, when status is failed. */
  error_kind?: SourceErrorKind | "aios_read";
  /** For a rate_limit failure: whether it stops only this account or the platform. */
  rate_limit_scope?: RateLimitScope;
  /** Platform rows of the compared days (for callers that need totals). */
  platform_rows?: CampaignDayRow[];
  aios_rows?: CampaignDayRow[];
};

export type AiosReader = (
  table: ReconcileTable,
  start: string,
  end: string,
) => Promise<CampaignDayRow[]>;

function errorResult(
  platform: ReconcilePlatform | null,
  window: ReconcileWindow | null,
  kind: SourceErrorKind | "aios_read",
  error: unknown,
  base: Record<string, unknown>,
): TableReconcileResult {
  return {
    status: "failed",
    platform,
    window_start: window?.start || null,
    window_end: window?.end || null,
    findings: [],
    error_kind: kind,
    ...(kind === "rate_limit"
      ? {
          rate_limit_scope:
            error instanceof ReconcileSourceError ? error.scope : "platform",
        }
      : {}),
    summary: {
      ...base,
      error_kind: kind,
      error: redactSecrets(error instanceof Error ? error.message : error),
    },
  };
}

/**
 * Reconcile one table. Platform failures never throw (except an exhausted call
 * budget, which the caller handles by retrying the table later): they return a
 * failed result with a redacted error and no findings, so a bad token cannot
 * flood the findings table.
 */
export async function reconcileTable(input: {
  table: ReconcileTable;
  source: PlatformSource;
  readAios: AiosReader;
  now: Date;
  days?: number;
  tolerance?: ReconcileTolerance;
  maxFindings?: number;
  keepRows?: boolean;
}): Promise<TableReconcileResult> {
  const { table, source } = input;
  const platform = platformFor(table.integration_type);
  const base: Record<string, unknown> = {
    platform,
    source: source.name,
    integration_type: table.integration_type,
  };
  if (!platform) {
    return {
      status: "skipped",
      platform,
      window_start: null,
      window_end: null,
      findings: [],
      summary: { ...base, skipped_reason: "unsupported_integration" },
    };
  }

  let account: AccountInfo;
  try {
    account = await source.account(table);
  } catch (err) {
    if (err instanceof ReconcileSourceError && err.kind === "budget") throw err;
    const kind = err instanceof ReconcileSourceError ? err.kind : "platform";
    if (kind === "config") {
      return {
        status: "skipped",
        platform,
        window_start: null,
        window_end: null,
        findings: [],
        summary: {
          ...base,
          skipped_reason: redactSecrets(
            err instanceof Error ? err.message : err,
          ),
        },
      };
    }
    return errorResult(platform, null, kind, err, base);
  }

  const window = completeDaysWindow(input.now, account.timezone, input.days);
  const pending = pendingDates(window, tableLastSyncAt(table));
  const compared = window.dates.filter((d) => !pending.includes(d));
  Object.assign(base, {
    account_id: account.account_id,
    account_name: account.name || null,
    timezone: window.timezone,
    timezone_fallback: window.timezone_fallback || undefined,
    currency: account.currency,
    pending_dates: pending,
    compared_dates: compared.length,
    requested_window: { start: window.start, end: window.end },
  });
  // Every day still waits for a sync (e.g. days=1 before the morning sync, or
  // a stalled sync): nothing can be compared, so this is not a match.
  if (!compared.length) {
    return {
      status: "skipped",
      platform,
      window_start: null,
      window_end: null,
      findings: [],
      summary: { ...base, skipped_reason: "not_yet_synced" },
    };
  }
  // The run's window is the days actually compared, so "checked 19.10–24.10"
  // never names a pending day that was held back.
  const comparedWindow = {
    start: compared[0],
    end: compared[compared.length - 1],
  };

  let platformRows: CampaignDayRow[];
  try {
    platformRows = (
      await source.campaignDays(
        table,
        { start: window.start, end: window.end },
        account,
      )
    ).rows;
  } catch (err) {
    if (err instanceof ReconcileSourceError && err.kind === "budget") throw err;
    const kind = err instanceof ReconcileSourceError ? err.kind : "platform";
    return errorResult(platform, window, kind, err, base);
  }

  let aiosRows: CampaignDayRow[];
  try {
    aiosRows = await input.readAios(table, window.start, window.end);
  } catch (err) {
    return errorResult(platform, window, "aios_read", err, base);
  }

  const cmp = compareCampaignDays({
    table,
    platform,
    aiosRows,
    platformRows,
    dates: compared,
    tolerance: input.tolerance,
  });
  const max = input.maxFindings ?? MAX_FINDINGS_PER_TABLE;
  const findings = cmp.findings.slice(0, max);
  return {
    status: cmp.findings.length ? "mismatch" : "ok",
    platform,
    window_start: comparedWindow.start,
    window_end: comparedWindow.end,
    findings,
    summary: {
      ...base,
      counts: cmp.counts,
      totals: cmp.totals,
      campaigns: cmp.campaigns,
      missing_dates: cmp.missing_dates,
      findings_total: cmp.findings.length,
      findings_stored: findings.length,
      truncated: cmp.findings.length > findings.length || undefined,
    },
    ...(input.keepRows
      ? { platform_rows: platformRows, aios_rows: aiosRows }
      : {}),
  };
}

// ── Fixture source (non-production only) ──────────────────────────────────

export type FixtureTable = {
  account: AccountInfo;
  rows: CampaignDayRow[];
  error?: { kind: SourceErrorKind; message: string };
};

/**
 * Canned platform data for Staging and tests. Refuses to exist in Production so
 * a stray `source: "fixture"` can never stand in for real platform numbers.
 */
export function createFixtureSource(
  fixtures: Record<string, FixtureTable>,
  appEnv: string | undefined | null,
): PlatformSource {
  if (!isNonProductionAppEnv(appEnv))
    throw new Error("fixture source is not allowed in production");
  const get = (table: ReconcileTable) => {
    const fx = fixtures[table.id];
    if (!fx)
      throw new ReconcileSourceError("config", `no fixture for ${table.id}`);
    if (fx.error)
      throw new ReconcileSourceError(fx.error.kind, fx.error.message);
    return fx;
  };
  return {
    name: "fixture",
    account: (table) => Promise.resolve().then(() => get(table).account),
    campaignDays: (table, window) =>
      Promise.resolve().then(() => ({
        rows: get(table).rows.filter(
          (r) => r.date >= window.start && r.date <= window.end,
        ),
      })),
  };
}
