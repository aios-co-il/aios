/**
 * One table's reconciliation in verify_report_vs_meta's answer shape
 * (AIO-238), which predates the per-day check and stays as Carmen reads it.
 */
import type { TableReconcileResult } from "../_shared/reconcile/run-summary.ts";
import type { ListedTable } from "../_shared/reconcile/types.ts";
import { facebookReportType } from "../_shared/report-meta-verify.mjs";
import { legacyMismatches } from "./legacy-mismatches.ts";
import { reportTypeIssue } from "./report-type-issue.ts";

/** One table's answer: an error line, a not-compared note, or totals and mismatches. */
export function toVerifyResult(
  table: ListedTable,
  result: TableReconcileResult,
): Record<string, unknown> {
  const client = table.client_name || table.client_id;
  const summary = result.summary;
  if (
    result.status === "skipped" &&
    summary.skipped_reason === "not_yet_synced"
  ) {
    // Nothing was compared: say so instead of calling it a match.
    return {
      client,
      agency: table.agency_name,
      timezone: summary.timezone,
      ok: false,
      not_compared: true,
      not_yet_synced: summary.pending_dates || [],
    };
  }
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
  const pending = new Set(summary.pending_dates || []);
  const reportType = facebookReportType(
    table.integration_type,
    table.integration_settings || {},
  );
  const { typeIssue, spendByObjective } = reportTypeIssue(
    spendByCampaign(result, pending),
    reportType,
  );
  const totals = summary.totals || {
    aios: { spend: 0 },
    platform: { spend: 0 },
  };
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

/** Meta's spend per campaign over the compared days, with the campaign's objective. */
function spendByCampaign(
  result: TableReconcileResult,
  pending: Set<string>,
): Array<{ objective: unknown; spend: number }> {
  const byCampaign = new Map<string, { objective: unknown; spend: number }>();
  for (const row of result.platform_rows || []) {
    if (pending.has(row.date)) {
      continue;
    }
    const entry = byCampaign.get(row.campaign_id) || {
      objective: row.data.campaign_objective,
      spend: 0,
    };
    entry.spend += Number(row.data.spend) || 0;
    byCampaign.set(row.campaign_id, entry);
  }
  return [...byCampaign.values()];
}
