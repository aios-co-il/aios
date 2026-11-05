/**
 * Records one full read of a report's ad account: each finding is stored (one
 * open alert per finding per 24h, Shabbat hold for non-critical types) and
 * sent, then the account's open status alerts that the read no longer finds
 * are closed. Call it only after a read that fully succeeded.
 */
import type { DbClient } from "../supabase-clients.ts";
import { notifyWhatsapp } from "./notify.ts";
import { resolveClearedAlerts } from "./resolve-cleared.ts";
import {
  type Finding,
  NOTIFY_ALERT_TYPES,
  type ReportAccount,
} from "./types.ts";
import { upsertCampaignAlert } from "./upsert-alert.ts";

export async function recordFindings(
  db: DbClient,
  input: { tenantId: string; report: ReportAccount; findings: Finding[] },
): Promise<{ created: number; resolved: number }> {
  const { tenantId, report, findings } = input;
  let created = 0;
  for (const finding of findings) {
    const notify = NOTIFY_ALERT_TYPES.has(finding.alert_type)
      ? (alertId: string) =>
          notifyWhatsapp(db, tenantId, report, finding, alertId)
      : null;
    const row = await upsertCampaignAlert(
      db,
      {
        tenant_id: tenantId,
        client_id: report.clientId,
        ad_account_id: report.adAccountId,
        campaign_id: finding.campaign_id,
        campaign_name: finding.campaign_name,
        alert_type: finding.alert_type,
        severity: finding.severity,
        details: { ...finding.details, provider: report.platform },
      },
      notify,
    );
    if (row) created++;
  }
  const resolved = await resolveClearedAlerts(db, {
    tenantId,
    adAccountId: report.adAccountId,
    findings,
  });
  return { created, resolved };
}
