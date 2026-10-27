/**
 * The summary stored on every reconcile_runs row, and one table's result
 * (AIO-238).
 */
import type { ReconcilePlatform } from "./run-status.ts";
import type {
  CampaignDayRow,
  FindingKind,
  PlatformSource,
  RateLimitScope,
  ReconcileFinding,
  RunStatus,
  SourceErrorKind,
} from "./types.ts";

export type CompareTotals = {
  aios: { spend: number; revenue: number };
  platform: { spend: number; revenue: number };
};

/** A finding as the run summary lists it (top_findings). */
export type TopFinding = {
  kind: FindingKind;
  campaign: string | null;
  date: string | null;
  metric: string | null;
  aios: number | null;
  platform: number | null;
};

/** What an auto-resync did: why it was skipped, or what it asked for. */
export type ResyncSummary =
  | { skipped: "sync_ignores_window" | "refresh_window" }
  | {
      requested_at: string;
      window: { start: string; end: string };
      queued: boolean;
      error?: string;
    };

/**
 * reconcile_runs.summary. Which fields a run has depends on how far it got
 * (skipped, failed or compared) and on the check: a report table, or a
 * tenant's unmapped ad accounts.
 */
export type RunSummary = {
  platform?: ReconcilePlatform | null;
  source?: PlatformSource["name"];
  integration_type?: string;
  account_id?: string;
  account_name?: string | null;
  timezone?: string;
  timezone_fallback?: true;
  currency?: string | null;
  /** Days left out because no sync has run since they ended. */
  pending_dates?: string[];
  compared_dates?: number;
  requested_window?: { start: string; end: string };
  skipped_reason?: string;
  error_kind?: string;
  error?: string;
  counts?: Partial<Record<FindingKind, number>>;
  totals?: CompareTotals;
  campaigns?: { aios: number; platform: number; both: number };
  missing_dates?: string[];
  findings_total?: number;
  findings_stored?: number;
  truncated?: true;
  /** The table's previous run was a mismatch too. */
  persisting?: true;
  /** The previous run could not be read, so whether the mismatch persists is unknown. */
  persisting_unknown?: true;
  resync?: ResyncSummary;
  top_findings?: TopFinding[];
  check?: "unmapped_accounts";
  connections?: number;
  accounts_seen?: number;
  unmapped_check?: "no_org_connections";
  incomplete?: true;
  errors?: string[];
};

export type TableReconcileResult = {
  status: RunStatus;
  platform: ReconcilePlatform | null;
  window_start: string | null;
  window_end: string | null;
  findings: ReconcileFinding[];
  summary: RunSummary;
  /** Kind of failure, when status is failed. */
  error_kind?: SourceErrorKind | "aios_read";
  /** For a rate_limit failure: whether it stops only this account or the platform. */
  rate_limit_scope?: RateLimitScope;
  /** Platform rows of the compared days (for callers that need totals). */
  platform_rows?: CampaignDayRow[];
  aios_rows?: CampaignDayRow[];
};
