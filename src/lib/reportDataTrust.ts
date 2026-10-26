// The report page's data-trust line: the result of the latest nightly
// reconciliation of this table against Meta / Google (AIO-238).

export const RECONCILED_INTEGRATION_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
] as const;

/** Older results are not shown: they no longer say anything about today's data. */
export const DATA_TRUST_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

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

const PLATFORM_LABEL: Record<string, string> = {
  meta: "מטא",
  google: "גוגל אדס",
};

function shortDate(ymd: string | null): string {
  if (!ymd) return "";
  const [, month, day] = ymd.split("-");
  return `${Number(day)}.${Number(month)}`;
}

export function isReconciledIntegration(type: string | null | undefined) {
  return (RECONCILED_INTEGRATION_TYPES as readonly string[]).includes(
    String(type || ""),
  );
}

/** What to show for the latest run, or null to show nothing. */
export function reportDataTrust(
  run: ReconcileRunSnapshot | null | undefined,
  now: Date = new Date(),
): DataTrust | null {
  if (!run) return null;
  if (run.status !== "ok" && run.status !== "mismatch") return null;
  const at = Date.parse(run.finished_at || run.started_at);
  if (!Number.isFinite(at) || now.getTime() - at > DATA_TRUST_MAX_AGE_MS)
    return null;
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
  const summary = (run.summary || {}) as { findings_total?: unknown };
  const total = Number(summary.findings_total) || 0;
  return {
    tone: "gaps",
    label: "נמצאו פערים מול הפלטפורמה",
    title: `בבדיקה מול ${platform}${range} נמצאו ${total || "כמה"} פערים`,
  };
}
