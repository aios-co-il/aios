/**
 * What the Meta monitor reports for one active report's ad account (David's
 * rules): a stop by Meta (billing, disapproval, account restriction) alerts; an
 * active report with nothing live alerts; one stopped campaign while another is
 * live does not.
 */
import {
  accountKey,
  type Finding,
  type ReportAccount,
} from "../_shared/campaign-status-alerts/types.ts";
import type { AccountSnapshot, MetaAd } from "./types.ts";

/** Graph account_status values other than 1, as the WhatsApp names them. */
const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  2: "חשבון הפרסום הושבת",
  3: "חוב פתוח בחשבון הפרסום — התשלום לא הוסדר",
  7: "חשבון הפרסום בבדיקת סיכון של Meta",
  8: "חשבון הפרסום ממתין להסדר תשלום",
  9: "תשלום נכשל — חשבון הפרסום בתקופת חסד",
  100: "חשבון הפרסום בתהליך סגירה",
  101: "חשבון הפרסום נסגר",
};

/** The WhatsApp line for an account_status, or a generic one for an unknown value. */
export function accountStatusLabel(status: number): string {
  return (
    ACCOUNT_STATUS_LABELS[status] || `חשבון הפרסום אינו פעיל (סטטוס ${status})`
  );
}

/**
 * Findings for one account read. A restricted account reports only that: its
 * campaigns cannot deliver, so a "nothing live" alert would repeat it.
 */
export function findingsFor(
  report: ReportAccount,
  snapshot: AccountSnapshot,
): Finding[] {
  const account = accountKey(report.adAccountId);
  if (snapshot.accountStatus !== 1) {
    return [
      {
        alert_type: "account_disabled",
        severity: "critical",
        campaign_id: account,
        campaign_name: snapshot.accountName,
        details: {
          provider: "meta",
          account_status: snapshot.accountStatus,
          reason: accountStatusLabel(snapshot.accountStatus),
        },
      },
    ];
  }

  const findings: Finding[] = [];
  for (const campaign of snapshot.campaigns) {
    if (campaign.effective_status === "WITH_ISSUES") {
      findings.push({
        alert_type: "campaign_stopped",
        severity: "critical",
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        details: { effective_status: campaign.effective_status },
      });
    } else if (campaign.issues_count > 0) {
      findings.push({
        alert_type: "campaign_with_issues",
        severity: "warning",
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        details: { issues_count: campaign.issues_count },
      });
    }
  }

  const billingAds = snapshot.blockedAds.filter(
    (ad) => ad.effective_status === "PENDING_BILLING_INFO",
  );
  if (billingAds.length) {
    findings.push({
      alert_type: "ad_account_billing_issue",
      severity: "critical",
      campaign_id: account,
      campaign_name: snapshot.accountName,
      details: { ads: billingAds.length },
    });
  }

  // A disapproved ad matters only while its campaign is meant to run.
  const disapprovedByCampaign = new Map<string, MetaAd[]>();
  for (const ad of snapshot.blockedAds) {
    if (
      ad.effective_status !== "DISAPPROVED" ||
      ad.campaign?.effective_status !== "ACTIVE"
    ) {
      continue;
    }
    const list = disapprovedByCampaign.get(ad.campaign.id) || [];
    list.push(ad);
    disapprovedByCampaign.set(ad.campaign.id, list);
  }
  for (const [campaignId, ads] of disapprovedByCampaign) {
    findings.push({
      alert_type: "ad_disapproved",
      severity: "critical",
      campaign_id: campaignId,
      campaign_name: ads[0].campaign?.name ?? null,
      details: {
        ads: ads.length,
        ad_id: ads[0].id,
        ad_name: ads[0].name,
      },
    });
  }

  if (!snapshot.hasLiveAd) {
    findings.push({
      alert_type: "no_live_ads",
      severity: "warning",
      campaign_id: account,
      campaign_name: snapshot.accountName,
      details: { provider: "meta" },
    });
  }
  return findings;
}
