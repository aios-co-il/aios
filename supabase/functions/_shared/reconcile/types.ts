/**
 * Shapes the reconciliation shares between its core, the nightly worker and
 * Carmen's tools (AIO-238). Plain type aliases (not interfaces) wherever a
 * value is stored as JSON, so they stay assignable to the generated Json type.
 */

export const FINDING_KINDS = [
  "mismatch",
  "missing_day",
  "missing_in_aios",
  "missing_on_platform",
  "unmapped_account",
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export type RunStatus = "ok" | "mismatch" | "failed" | "skipped";

export type ReconcileTable = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  name?: string | null;
  integration_type: string;
  integration_settings?: Record<string, unknown> | null;
  category?: string | null;
  last_sync_at?: string | null;
};

/** A report table as listed for a check, with its client and agency. */
export type ListedTable = ReconcileTable & {
  client_name: string | null;
  client_status: string | null;
  agency_name: string | null;
};

/** One campaign × day row, either side. `data` is the stored/synced record shape. */
export type CampaignDayRow = {
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  data: Record<string, unknown>;
};

export type FindingDetails = {
  campaign_name?: string | null;
  /** missing_day: campaigns the platform shows spend for on that day. */
  campaigns_with_spend?: number;
  /** A campaign found on one side only: its days with spend. */
  dates?: string[];
  aios_row_missing?: true;
  platform_row_missing?: true;
  /** unmapped_account: the ad account and the connection that sees it. */
  account_id?: string;
  account_name?: string | null;
  currency?: string | null;
  connection_id?: string;
};

export type ReconcileFinding = {
  kind: FindingKind;
  campaign_id: string | null;
  date: string | null;
  metric: string | null;
  aios_value: number | null;
  platform_value: number | null;
  details: FindingDetails;
};

export type AccountInfo = {
  account_id: string;
  timezone: string;
  currency: string | null;
  name?: string | null;
};

export type SourceErrorKind =
  "auth" | "rate_limit" | "platform" | "config" | "budget";

/**
 * How far a rate limit reaches: "account" throttles (Meta's per-ad-account
 * 80000-range codes) stop only that table; anything else stops the platform.
 */
export type RateLimitScope = "account" | "platform";

/** Injectable source of platform truth (Meta Graph, Google GAQL or a fixture). */
export interface PlatformSource {
  readonly name: "meta" | "google" | "fixture";
  account(table: ReconcileTable): Promise<AccountInfo>;
  campaignDays(
    table: ReconcileTable,
    window: { start: string; end: string },
    account: AccountInfo,
  ): Promise<{ rows: CampaignDayRow[] }>;
}

/** Reads the stored campaign rows of a table for a date range. */
export type AiosReader = (
  table: ReconcileTable,
  start: string,
  end: string,
) => Promise<CampaignDayRow[]>;
