/**
 * manager.round_llm_share_pct (AIO-254): the percent of the tenant's monthly
 * LLM budget the manager round may spend, spread evenly over 30 days. It sits
 * beside settings.ts, which resolves it, to keep that file within max-lines.
 */

/**
 * A stored share from 0 to 100 (higher is capped at 100), or the fallback,
 * also for null, "" and booleans. 0 is valid: the round classifies with the
 * markers only.
 */
export function roundLlmSharePct(raw: unknown, fallback: number): number {
  const numeric =
    typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "");
  const value = numeric ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? Math.min(100, value) : fallback;
}
