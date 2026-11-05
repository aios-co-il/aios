/**
 * One table's reconciliation in verify_report_vs_meta's answer shape
 * (AIO-238), which predates the per-day check and stays as Carmen reads it.
 */
import type { TableReconcileResult } from "../_shared/reconcile/run-summary.ts";
import type { ListedTable } from "../_shared/reconcile/types.ts";
import { legacyMismatches } from "./legacy-mismatches.ts";
import { facebookReportType, reportTypeIssue } from "./report-type-issue.ts";

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
  const { typeIssue, spendByGoal } = reportTypeIssue(
    (result.platform_rows || []).filter((row) => !pending.has(row.date)),
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
    spend_by_goal: spendByGoal,
    report_type: reportType,
    type_issue: typeIssue,
    ...(pendingDates.length ? { not_yet_synced: pendingDates } : {}),
    mismatches: legacyMismatches(result.findings),
  };
}
