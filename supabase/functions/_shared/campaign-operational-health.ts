/**
 * The Google Ads side of David's status rules, for one customer of an active
 * report: a campaign Google will not serve alerts; an active report with no
 * campaign live alerts; one paused campaign beside a live one does not.
 */
import { accountKey, type Finding } from "./campaign-status-alerts/types.ts";

export type OperationalCampaignState = {
  id: string;
  name: string;
  status: string;
  primary_status?: string | null;
  primary_status_reasons?: string[];
};

/** Primary statuses that serve, or are about to (PENDING: scheduled or in review). */
const LIVE_PRIMARY_STATUSES = new Set([
  "ELIGIBLE",
  "LIMITED",
  "LEARNING",
  "PENDING",
]);

/**
 * Findings for the campaigns of one customer (REMOVED ones are not read):
 * - an enabled campaign Google will not serve (NOT_ELIGIBLE: disapproval,
 *   billing, policy) → campaign_stopped;
 * - an enabled campaign that is MISCONFIGURED → campaign_with_issues (recorded only);
 * - no enabled campaign live or pending → no_live_ads.
 * A campaign the team paused (status PAUSED) is not a finding by itself. An
 * enabled campaign without a primary status counts as live, so a missing field
 * never reads as "nothing live".
 */
export function googleFindingsFor(
  customerId: string,
  campaigns: OperationalCampaignState[],
): Finding[] {
  const enabled = campaigns.filter((c) => c.status === "ENABLED");
  const findings: Finding[] = [];
  for (const campaign of enabled) {
    const reasons = campaign.primary_status_reasons || [];
    if (campaign.primary_status === "NOT_ELIGIBLE") {
      findings.push({
        alert_type: "campaign_stopped",
        severity: "critical",
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        details: {
          primary_status: campaign.primary_status,
          primary_status_reasons: reasons,
          ...(reasons.length
            ? { reason: `הקמפיין נעצר ע״י Google Ads (${reasons.join(", ")})` }
            : {}),
        },
      });
    } else if (campaign.primary_status === "MISCONFIGURED") {
      findings.push({
        alert_type: "campaign_with_issues",
        severity: "warning",
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        details: {
          primary_status: campaign.primary_status,
          primary_status_reasons: reasons,
        },
      });
    }
  }
  const live = enabled.some(
    (c) => !c.primary_status || LIVE_PRIMARY_STATUSES.has(c.primary_status),
  );
  if (!live) {
    findings.push({
      alert_type: "no_live_ads",
      severity: "warning",
      campaign_id: accountKey(customerId),
      campaign_name: null,
      details: { enabled_campaigns: enabled.length },
    });
  }
  return findings;
}
