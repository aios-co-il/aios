/**
 * A switched-off report whose campaigns still spend (AIO-501): a report table
 * with `crm_tables.campaign_active = false` that spent on the platform in the
 * last 3 full days, the window the alert gate calls "still spending"
 * (`pulse/alert-gate.ts`). The pulse raises one instant alert per client and
 * table so someone decides whether to stop those campaigns. The table never
 * feeds the campaign alerts: its rows are read apart from the active tables'.
 */
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";

/** One switched-off report table's spend in the last 3 full days. */
export type OffReportSpend = {
  table_id: string;
  table_name: string;
  /** Spend in the window, rounded to agorot. */
  spend_3d: number;
  /** First and last Israel day of the window (last 3 full days). */
  window_start: string;
  window_end: string;
};

/** The snapshot fields the rule reads. */
export type OffReportSpendSnapshot = {
  client_id: string;
  off_report_spend?: Array<OffReportSpend> | null;
};

/**
 * The dedupe fingerprint: one finding per client and table. The log row that
 * holds it is keyed by tenant_id as well (ownRecentDeliveries), and the
 * fingerprint stays tenant-free so the cross-org dedupe of a shared client
 * (cross-tenant-recipients.ts) matches the other org's row, as for every rule.
 */
export function reportOffSpendingFingerprint(
  clientId: string,
  tableId: string,
): string {
  return `report_off_spending:${clientId}:${tableId}`;
}

/** The pulse_instant_alert_log.campaign_key of a table's finding. */
export function reportOffSpendingKey(tableId: string): string {
  return `report_off:${tableId}`;
}

/** One report_off_spending candidate per switched-off table that spent. */
export function reportOffSpendingCandidates(
  snapshot: OffReportSpendSnapshot,
  clientName: string,
): Array<PulseInstantAlertCandidate> {
  const items = Array.isArray(snapshot.off_report_spend)
    ? snapshot.off_report_spend
    : [];
  return items
    .filter((item) => item.table_id && Number(item.spend_3d) > 0)
    .map((item) => ({
      client_id: snapshot.client_id,
      client_name: clientName,
      rule_type: "report_off_spending" as const,
      campaign_key: reportOffSpendingKey(item.table_id),
      fingerprint: reportOffSpendingFingerprint(
        snapshot.client_id,
        item.table_id,
      ),
      severity_score: Number(item.spend_3d),
      evidence: {
        table_id: item.table_id,
        table_name: item.table_name,
        spend_3d: item.spend_3d,
        window_start: item.window_start,
        window_end: item.window_end,
      },
      line: `${clientName} — ${offReportSpendText(item)}`,
    }));
}

/**
 * The table's text, "דוח "X" כבוי אבל הוציא ₪283 ב-3 הימים האחרונים": the
 * alert line after the client name, and the snapshot flag the dashboard shows.
 */
export function offReportSpendText(item: OffReportSpend): string {
  const spend = Math.round(Number(item.spend_3d)).toLocaleString("he-IL");
  return `דוח "${item.table_name}" כבוי אבל הוציא ₪${spend} ב-3 הימים האחרונים`;
}
