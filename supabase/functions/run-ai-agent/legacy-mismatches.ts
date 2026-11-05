/**
 * Per-day findings in verify_report_vs_meta's older mismatch shape (AIO-238):
 * one entry per campaign and metric, with the days it was off.
 */
import { round2 } from "../_shared/reconcile/metrics.ts";
import type { ReconcileFinding } from "../_shared/reconcile/types.ts";

type LegacyMismatch = {
  kind: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  metric?: string;
  meta: number;
  aios: number;
  date?: string;
  dates?: string[];
};

/** A per-campaign mismatch entry while its days are summed. */
type GroupedMismatch = LegacyMismatch & { dates: string[] };

/** Findings → the verify tool's mismatch entries (one per campaign and metric). */
export function legacyMismatches(
  findings: ReconcileFinding[],
): LegacyMismatch[] {
  const out: LegacyMismatch[] = [];
  const grouped = new Map<string, GroupedMismatch>();
  for (const f of findings) {
    const name = f.details.campaign_name || null;
    if (f.kind === "missing_day") {
      out.push({
        kind: "missing_day",
        date: f.date || undefined,
        meta: f.platform_value ?? 0,
        aios: 0,
      });
    } else if (
      f.kind === "missing_in_aios" ||
      f.kind === "missing_on_platform"
    ) {
      out.push({
        kind:
          f.kind === "missing_in_aios" ? "missing_in_aios" : "missing_in_meta",
        campaign_id: f.campaign_id,
        campaign_name: name,
        meta: f.platform_value ?? 0,
        aios: f.aios_value ?? 0,
      });
    } else if (f.kind === "mismatch") {
      addMismatch(grouped, f, name);
    }
  }
  for (const entry of grouped.values()) {
    entry.dates = [...new Set(entry.dates)].sort();
    out.push(entry);
  }
  return out;
}

/** Adds a per-day mismatch to its campaign and metric's entry. */
function addMismatch(
  grouped: Map<string, GroupedMismatch>,
  f: ReconcileFinding,
  name: string | null,
): void {
  const kind =
    f.metric === "spend" || f.metric === "revenue" ? f.metric : "results";
  const key = `${kind}|${f.metric}|${f.campaign_id}`;
  const entry = grouped.get(key) || {
    kind,
    campaign_id: f.campaign_id,
    campaign_name: name,
    ...(kind === "results" ? { metric: f.metric || undefined } : {}),
    meta: 0,
    aios: 0,
    dates: [],
  };
  entry.meta = round2(entry.meta + (f.platform_value ?? 0));
  entry.aios = round2(entry.aios + (f.aios_value ?? 0));
  if (f.date) {
    entry.dates.push(f.date);
  }
  grouped.set(key, entry);
}
