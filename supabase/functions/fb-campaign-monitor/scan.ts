/** One tenant's scan: every active Meta report's ad account, a few at a time. */
import { resolveMetaReportToken } from "../_shared/meta-report-token.ts";
import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { findingsFor } from "./findings.ts";
import { NOTIFY_ALERT_TYPES, type ReportAccount } from "./types.ts";
import { readAccount } from "./meta-account.ts";
import { notifyWhatsapp } from "./notify.ts";
import { loadReportAccounts } from "./report-accounts.ts";
import { resolveClearedAlerts } from "./resolve-cleared.ts";
import { upsertCampaignAlert } from "./upsert-alert.ts";

/** Accounts read at once per tenant, to stay under Graph rate limits. */
const ACCOUNT_CONCURRENCY = 4;

type ScanStats = {
  accounts: number;
  alerts_created: number;
  alerts_resolved: number;
  errors: number;
};

/** Reads one report's account, records its findings and closes what cleared. */
async function scanReport(
  db: DbClient,
  tenantId: string,
  report: ReportAccount,
  token: string,
  stats: ScanStats,
) {
  const read = await readAccount(report.adAccountId, token);
  if (!read.ok) {
    // A partial read neither alerts nor closes anything.
    console.error(
      "[fb-campaign-monitor] account read failed",
      report.adAccountId,
      read.error,
    );
    stats.errors++;
    return;
  }
  const findings = findingsFor(report, read.snapshot);
  for (const finding of findings) {
    const notify = NOTIFY_ALERT_TYPES.has(finding.alert_type)
      ? (alertId: string) =>
          notifyWhatsapp(db, tenantId, report, finding, alertId)
      : null;
    const created = await upsertCampaignAlert(
      db,
      {
        tenant_id: tenantId,
        client_id: report.clientId,
        ad_account_id: report.adAccountId,
        campaign_id: finding.campaign_id,
        campaign_name: finding.campaign_name,
        alert_type: finding.alert_type,
        severity: finding.severity,
        details: finding.details,
      },
      notify,
    );
    if (created) stats.alerts_created++;
  }
  stats.alerts_resolved += await resolveClearedAlerts(db, {
    tenantId,
    adAccountId: report.adAccountId,
    findings,
  });
}

// Single-tenant scan (called per tenant, in its own invocation for CPU limits).
export async function runTenantScan(tenantId: string): Promise<ScanStats> {
  const db = serviceClient();
  const stats: ScanStats = {
    accounts: 0,
    alerts_created: 0,
    alerts_resolved: 0,
    errors: 0,
  };
  const reports = await loadReportAccounts(db, tenantId);
  const tokens = new Map<string, Promise<string | null>>();
  const tokenFor = (integrationId: string | null) => {
    const key = integrationId || "";
    let token = tokens.get(key);
    if (!token) {
      token = resolveMetaReportToken(db, { tenantId, integrationId });
      tokens.set(key, token);
    }
    return token;
  };
  for (let i = 0; i < reports.length; i += ACCOUNT_CONCURRENCY) {
    await Promise.all(
      reports.slice(i, i + ACCOUNT_CONCURRENCY).map(async (report) => {
        stats.accounts++;
        try {
          const token = await tokenFor(report.integrationId);
          if (!token) {
            console.error(
              "[fb-campaign-monitor] no Meta token for report account",
              report.adAccountId,
            );
            stats.errors++;
            return;
          }
          await scanReport(db, tenantId, report, token, stats);
        } catch (e) {
          console.error(
            "[fb-campaign-monitor] account error",
            report.adAccountId,
            e instanceof Error ? e.message : e,
          );
          stats.errors++;
        }
      }),
    );
  }
  console.log(
    "[fb-campaign-monitor] tenant done",
    tenantId,
    JSON.stringify(stats),
  );
  return stats;
}
