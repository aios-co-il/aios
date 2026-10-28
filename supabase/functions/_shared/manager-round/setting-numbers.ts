/** Numeric manager settings read from stored JSON, with a fallback for anything else. */

/** A positive number, or the fallback. */
export function positive(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** A number of zero or more, or the fallback (also for null, "" and booleans). */
export function nonNegative(raw: unknown, fallback: number): number {
  const numeric =
    typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "");
  const value = numeric ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
