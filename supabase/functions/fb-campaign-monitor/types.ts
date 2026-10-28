/** Shapes shared by the Meta monitor's modules. */
import type { Json } from "../_shared/database.types.ts";

/** The ad account of an active Meta report table and the client it reports on. */
export type ReportAccount = {
  /** Graph id, with the act_ prefix. */
  adAccountId: string;
  clientId: string;
  clientName: string | null;
  /** tenant_integrations id stored on the table, if any. */
  integrationId: string | null;
};

export type MetaCampaign = {
  id: string;
  name: string | null;
  effective_status: string | null;
  issues_count: number;
};

export type MetaAd = {
  id: string;
  name: string | null;
  effective_status: string | null;
  campaign: {
    id: string;
    name: string | null;
    effective_status: string | null;
  } | null;
};

/** One read of the ad account; every field comes from a call that succeeded. */
export type AccountSnapshot = {
  accountName: string | null;
  /** Graph account_status: 1 is active. */
  accountStatus: number;
  /** ACTIVE and WITH_ISSUES campaigns. */
  campaigns: MetaCampaign[];
  /** DISAPPROVED and PENDING_BILLING_INFO ads. */
  blockedAds: MetaAd[];
  /** At least one ad is live or in review (ACTIVE, PENDING_REVIEW, IN_PROCESS, PREAPPROVED). */
  hasLiveAd: boolean;
};

/** Alert types this monitor owns: it records them and resolves them when cleared. */
export const MONITOR_ALERT_TYPES = [
  "account_disabled",
  "ad_account_billing_issue",
  "campaign_stopped",
  "campaign_with_issues",
  "ad_disapproved",
  "no_live_ads",
] as const;

export type MonitorAlertType = (typeof MONITOR_ALERT_TYPES)[number];

/** Types that send a WhatsApp; campaign_with_issues is recorded only. */
export const NOTIFY_ALERT_TYPES: ReadonlySet<string> =
  new Set<MonitorAlertType>([
    "account_disabled",
    "ad_account_billing_issue",
    "campaign_stopped",
    "ad_disapproved",
    "no_live_ads",
  ]);

export type Finding = {
  alert_type: MonitorAlertType;
  severity: "warning" | "critical";
  /** Dedupe key with alert_type; `account:<act id>` for account-level findings. */
  campaign_id: string;
  campaign_name: string | null;
  details: { [key: string]: Json | undefined };
};
