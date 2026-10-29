/**
 * Which pulse connection_lost findings are a real connection loss (AIO-226).
 * Only these may go out on Shabbat; a connection_lost made only of
 * single-campaign issues (a stopped campaign, a disapproved ad) waits.
 */
import { isShabbatCriticalAlert } from "../shabbat/critical-alerts.ts";

/**
 * True for a stale or missing sync, no connected campaign table, or an open
 * account-level stop/disable among the client's critical campaign issues.
 */
export function isRealConnectionLoss(
  flags: string[],
  statusNoData: boolean,
  criticalIssues: Array<{ alertType?: string | null }>,
): boolean {
  return (
    flags.some(isLostConnectionFlag) ||
    isNoDataWithoutTable(statusNoData, flags) ||
    criticalIssues.some((issue) => isShabbatCriticalAlert(issue.alertType))
  );
}

/** A snapshot flag that says the data source itself is gone. */
export function isLostConnectionFlag(flag: string): boolean {
  return flag.includes("אין טבלת קמפיין") || flag.includes("סנכרון ישן");
}

/** A no_data status with no connected campaign table behind it. */
export function isNoDataWithoutTable(
  statusNoData: boolean,
  flags: string[],
): boolean {
  return statusNoData && flags.some((flag) => flag.includes("אין טבלת"));
}
