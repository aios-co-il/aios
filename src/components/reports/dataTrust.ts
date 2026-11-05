/**
 * The report page's data-trust line: the result of the latest nightly
 * reconciliation of this table against Meta / Google (AIO-238).
 */
import {
  isRateLimitRun,
  RECONCILE_INTEGRATION_TYPES,
  RECONCILE_RESULT_MAX_AGE_MS,
} from "../../../supabase/functions/_shared/reconcile/run-status.ts";

export type ReconcileRunSnapshot = {
  status: string;
  started_at: string;
  finished_at: string | null;
  window_start: string | null;
  window_end: string | null;
  platform?: string | null;
  summary?: unknown;
};

export type DataTrust = {
  tone: "ok" | "gaps";
  label: string;
  title: string;
};

/** What to show for the latest run, or null to show nothing. */
export function reportDataTrust(
  run: ReconcileRunSnapshot | null | undefined,
  now: Date = new Date(),
): DataTrust | null {
  if (!run) {
    return null;
  }
  if (run.status !== "ok" && run.status !== "mismatch") {
    return null;
  }
  const at = Date.parse(run.finished_at || run.started_at);
  if (
    !Number.isFinite(at) ||
    now.getTime() - at > RECONCILE_RESULT_MAX_AGE_MS
  ) {
    return null;
  }
  const platform = PLATFORM_LABEL[String(run.platform || "")] || "הפלטפורמה";
  const range =
    run.window_start && run.window_end
      ? ` לימים ${shortDate(run.window_start)}–${shortDate(run.window_end)}`
      : "";
  if (run.status === "ok") {
    return {
      tone: "ok",
      label: "תואם לפלטפורמה ✓",
      title: `הנתונים נבדקו מול ${platform}${range} ותואמים`,
    };
  }
  const total = findingsTotal(run.summary);
  const found =
    total === 1
      ? "נמצא פער אחד"
      : total > 1
        ? `נמצאו ${total} פערים`
        : "נמצאו פערים";
  return {
    tone: "gaps",
    label: "נמצאו פערים מול הפלטפורמה",
    title: `בבדיקה מול ${platform}${range} ${found}`,
  };
}

/**
 * The run the line describes: the newest one (runs come newest first), except
 * that a run a rate limit stopped is passed over, so the previous result stays
 * until it is too old to show.
 */
export function pickTrustRun(
  runs: ReconcileRunSnapshot[] | null | undefined,
): ReconcileRunSnapshot | null {
  return (runs || []).find((run) => !isRateLimitRun(run)) || null;
}

/** True for the report types the nightly reconciliation checks. */
export function isReconciledIntegration(
  type: string | null | undefined,
): boolean {
  return RECONCILE_INTEGRATION_TYPES.some((reconciled) => reconciled === type);
}

const PLATFORM_LABEL: Record<string, string> = {
  meta: "מטא",
  google: "Google Ads",
};

/** yyyy-mm-dd as d.m. */
function shortDate(ymd: string | null): string {
  if (!ymd) {
    return "";
  }
  const [, month, day] = ymd.split("-");
  return `${Number(day)}.${Number(month)}`;
}

/** The run summary's findings_total, or 0. */
function findingsTotal(summary: unknown): number {
  if (typeof summary !== "object" || summary === null) {
    return 0;
  }
  return "findings_total" in summary ? Number(summary.findings_total) || 0 : 0;
}
