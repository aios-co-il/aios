/**
 * Carmen's on-demand checks, built on the reconciliation core (AIO-238):
 * verify_report_vs_meta (live, Meta tables) keeps its old answer shape but now
 * compares day by day in the ad account's time zone, covers results and revenue
 * as well as spend, counts rows without entity_level as campaign rows, and has
 * no table cap (a deadline lists whatever was not reached instead).
 */
import {
  CallBudget,
  type ReconcileFinding,
  reconcileTable,
  type TableReconcileResult,
} from "./reconcile-core.ts";
import {
  type ListedTable,
  listReconcileTables,
  readAiosCampaignRows,
  resolveMetaToken,
} from "./reconcile-db.ts";
import { createMetaSource } from "./reconcile-sources.ts";
import { facebookReportType, reportTypeIssue } from "./report-meta-verify.mjs";

// deno-lint-ignore no-explicit-any
type Db = any;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const META_TABLE_TYPES = ["facebook_insights", "facebook_ecommerce"];

/** Every Meta report table in scope (paged, no cap). */
export async function listVerifyTables(
  db: Db,
  opts: {
    tenantIds: string[];
    clientId?: string | null;
    agencyName?: string | null;
  },
): Promise<ListedTable[]> {
  const out: ListedTable[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await listReconcileTables(db, {
      afterId,
      limit: 500,
      tenantIds: opts.tenantIds,
      clientId: opts.clientId || null,
      integrationTypes: META_TABLE_TYPES,
    });
    out.push(...page);
    if (page.length < 500) break;
    afterId = page[page.length - 1].id;
  }
  const agency = String(opts.agencyName || "").toLowerCase();
  return out.filter((t) => {
    if (!t.integration_settings?.ad_account_id) return false;
    if (!opts.clientId && (!t.client_id || t.client_status !== "active"))
      return false;
    if (
      agency &&
      !String(t.agency_name || "")
        .toLowerCase()
        .includes(agency)
    )
      return false;
    return true;
  });
}

type LegacyMismatch = {
  kind: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  metric?: string;
  meta: number;
  aios: number;
  date?: string;
  dates?: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Findings → the verify tool's mismatch entries (one per campaign and metric). */
export function legacyMismatches(
  findings: ReconcileFinding[],
): LegacyMismatch[] {
  const out: LegacyMismatch[] = [];
  const grouped = new Map<string, LegacyMismatch>();
  for (const f of findings) {
    const name = (f.details?.campaign_name as string) || null;
    if (f.kind === "missing_day") {
      out.push({
        kind: "missing_day",
        date: f.date || undefined,
        meta: f.platform_value ?? 0,
        aios: 0,
      });
    } else if (
      f.kind === "missing_in_aios" ||
      f.kind === "missing_on_platform"
    ) {
      out.push({
        kind:
          f.kind === "missing_in_aios" ? "missing_in_aios" : "missing_in_meta",
        campaign_id: f.campaign_id,
        campaign_name: name,
        meta: f.platform_value ?? 0,
        aios: f.aios_value ?? 0,
      });
    } else if (f.kind === "mismatch") {
      const kind =
        f.metric === "spend"
          ? "spend"
          : f.metric === "revenue"
            ? "revenue"
            : "results";
      const key = `${kind}|${f.metric}|${f.campaign_id}`;
      const entry = grouped.get(key) || {
        kind,
        campaign_id: f.campaign_id,
        campaign_name: name,
        ...(kind === "results" ? { metric: f.metric || undefined } : {}),
        meta: 0,
        aios: 0,
        dates: [],
      };
      entry.meta = round2(entry.meta + (f.platform_value ?? 0));
      entry.aios = round2(entry.aios + (f.aios_value ?? 0));
      if (f.date) entry.dates!.push(f.date);
      grouped.set(key, entry);
    }
  }
  for (const entry of grouped.values()) {
    entry.dates = [...new Set(entry.dates)].sort();
    out.push(entry);
  }
  return out;
}

/** One table's reconciliation in the verify tool's answer shape. */
export function toVerifyResult(
  table: ListedTable,
  result: TableReconcileResult,
): Record<string, unknown> {
  const client = table.client_name || table.client_id;
  const summary = result.summary || {};
  if (result.status === "failed" || result.status === "skipped") {
    const reason = String(summary.error || summary.skipped_reason || "");
    return {
      client,
      error:
        result.error_kind === "auth" && /no active meta/i.test(reason)
          ? "אין טוקן פייסבוק פעיל"
          : `מטא: ${reason || "הבדיקה נכשלה"}`,
    };
  }
  const byCampaign = new Map<string, { objective: unknown; spend: number }>();
  const compared = new Set<string>();
  const pending = new Set((summary.pending_dates as string[]) || []);
  for (const row of result.platform_rows || []) {
    if (pending.has(row.date)) continue;
    compared.add(row.date);
    const entry = byCampaign.get(row.campaign_id) || {
      objective: row.data.campaign_objective,
      spend: 0,
    };
    entry.spend += Number(row.data.spend) || 0;
    byCampaign.set(row.campaign_id, entry);
  }
  const reportType = facebookReportType(
    table.integration_type,
    table.integration_settings || {},
  );
  const { typeIssue, spendByObjective } = reportTypeIssue(
    [...byCampaign.values()] as Array<{ objective?: string; spend: number }>,
    reportType,
  );
  const totals = (summary.totals as {
    aios: { spend: number };
    platform: { spend: number };
  }) || { aios: { spend: 0 }, platform: { spend: 0 } };
  const pendingDates = [...pending];
  return {
    client,
    agency: table.agency_name,
    period: `${result.window_start} – ${result.window_end}`,
    timezone: summary.timezone,
    ok: result.status === "ok" && !typeIssue,
    meta_spend: totals.platform.spend,
    aios_spend: totals.aios.spend,
    spend_by_objective: spendByObjective,
    report_type: reportType,
    type_issue: typeIssue,
    ...(pendingDates.length ? { not_yet_synced: pendingDates } : {}),
    mismatches: legacyMismatches(result.findings),
  };
}

/** verify_report_vs_meta: live check of the scoped Meta report tables. */
export async function verifyReportVsMeta(input: {
  db: Db;
  tables: ListedTable[];
  days: number;
  now: Date;
  fallbackTenantIds?: string[];
  fetch?: FetchLike;
  budget?: CallBudget;
  concurrency?: number;
  deadlineMs?: number;
}): Promise<Record<string, unknown>> {
  const budget = input.budget || new CallBudget(600);
  const deadline = Date.now() + (input.deadlineMs ?? 75_000);
  const source = createMetaSource({
    getToken: (t) => resolveMetaToken(input.db, t, input.fallbackTenantIds),
    budget,
    fetch: input.fetch,
  });
  const results: Array<Record<string, unknown>> = new Array(
    input.tables.length,
  );
  const notChecked: string[] = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= input.tables.length) return;
      const table = input.tables[i];
      if (Date.now() >= deadline || budget.remaining < 4) {
        notChecked.push(String(table.client_name || table.client_id));
        continue;
      }
      try {
        const result = await reconcileTable({
          table,
          source,
          readAios: (t, s, e) => readAiosCampaignRows(input.db, t.id, s, e),
          now: input.now,
          days: input.days,
          maxFindings: 1000,
          keepRows: true,
        });
        results[i] = toVerifyResult(table, result);
      } catch {
        notChecked.push(String(table.client_name || table.client_id));
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(input.concurrency ?? 4, input.tables.length) },
      worker,
    ),
  );
  const checked = results.filter(Boolean);
  const problems = checked.filter((r) => r.error || !r.ok);
  const periods = [
    ...new Set(checked.map((r) => r.period).filter(Boolean)),
  ] as string[];
  return {
    period:
      periods.length === 1
        ? periods[0]
        : periods.length
          ? `${periods[0]} (לפי אזור הזמן של כל חשבון)`
          : null,
    checked: checked.length,
    ok_count: checked.length - problems.length,
    ok_clients: checked.filter((r) => !r.error && r.ok).map((r) => r.client),
    problems,
    ...(notChecked.length
      ? {
          not_checked: notChecked,
          note: "לא הספקתי לבדוק את כל הדוחות בזמן — הבדיקה הלילית שומרת תוצאות לכולם (get_reconciliation_status)",
        }
      : {}),
  };
}
