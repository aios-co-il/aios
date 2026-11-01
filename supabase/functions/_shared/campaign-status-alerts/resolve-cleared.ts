/**
 * Closes the monitor's open alerts on an ad account that the latest full read no
 * longer finds, so a campaign that runs again stops counting as stopped (the
 * pulse reads open alerts) and a later stop alerts again.
 */
import type { DbClient } from "../supabase-clients.ts";
import { type Finding, STATUS_ALERT_TYPES } from "./types.ts";

export async function resolveClearedAlerts(
  db: Pick<DbClient, "from">,
  input: {
    tenantId: string;
    adAccountId: string;
    findings: Finding[];
    now?: Date;
  },
): Promise<number> {
  const { data: open, error } = await db
    .from("campaign_alerts")
    .select("id, campaign_id, alert_type")
    .eq("tenant_id", input.tenantId)
    .eq("ad_account_id", input.adAccountId)
    .in("alert_type", [...STATUS_ALERT_TYPES])
    .is("resolved_at", null);
  if (error) {
    console.error(
      "[campaign-status-alerts] open alerts lookup failed",
      input.adAccountId,
      error.message,
    );
    return 0;
  }
  const current = new Set(
    input.findings.map((f) => findingKey(f.alert_type, f.campaign_id)),
  );
  const cleared = (open || [])
    .filter((row) => !current.has(findingKey(row.alert_type, row.campaign_id)))
    .map((row) => row.id);
  if (!cleared.length) {
    return 0;
  }
  const { error: updateError } = await db
    .from("campaign_alerts")
    .update({ resolved_at: (input.now ?? new Date()).toISOString() })
    .in("id", cleared)
    .is("resolved_at", null);
  if (updateError) {
    console.error(
      "[campaign-status-alerts] resolving cleared alerts failed",
      input.adAccountId,
      updateError.message,
    );
    return 0;
  }
  return cleared.length;
}

function findingKey(alertType: string, campaignId: string): string {
  return `${alertType}\u0000${campaignId}`;
}
