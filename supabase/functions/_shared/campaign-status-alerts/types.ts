/**
 * Shapes shared by the Meta monitor and the Google operational check (David's
 * rules): a stop by the platform alerts, an active report with nothing live
 * alerts, one paused campaign beside a live one does not.
 */
import type { Json } from "../database.types.ts";

export type AdPlatform = "meta" | "google";

/** The ad account of an active report table and the client it reports on. */
export type ReportAccount = {
  platform: AdPlatform;
  /** Meta: `act_<id>`; Google: the customer id. Stored as campaign_alerts.ad_account_id. */
  adAccountId: string;
  clientId: string;
  clientName: string | null;
  /** tenant_integrations id stored on the table, if any. */
  integrationId: string | null;
};

/** Alert types the status checks own: they record them and resolve them when cleared. */
export const STATUS_ALERT_TYPES = [
  "account_disabled",
  "ad_account_billing_issue",
  "campaign_stopped",
  "campaign_with_issues",
  "ad_disapproved",
  "no_live_ads",
] as const;

export type StatusAlertType = (typeof STATUS_ALERT_TYPES)[number];

/** Types that send a WhatsApp; campaign_with_issues is recorded only. */
export const NOTIFY_ALERT_TYPES: ReadonlySet<string> = new Set<StatusAlertType>(
  [
    "account_disabled",
    "ad_account_billing_issue",
    "campaign_stopped",
    "ad_disapproved",
    "no_live_ads",
  ],
);

export type Finding = {
  alert_type: StatusAlertType;
  severity: "warning" | "critical";
  /** Dedupe key with alert_type; `account:<id>` for account-level findings. */
  campaign_id: string;
  campaign_name: string | null;
  details: { [key: string]: Json | undefined };
};

/** The account-level dedupe key. */
export function accountKey(adAccountId: string): string {
  return `account:${adAccountId}`;
}
