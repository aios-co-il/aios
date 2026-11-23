/** Rounds to `digits` decimals. */
export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Percent change from `before` to `now`, one decimal; null without a base. */
export function pctChange(
  now: number | null | undefined,
  before: number | null | undefined,
): number | null {
  if (typeof now !== "number" || typeof before !== "number" || before === 0) {
    return null;
  }
  return round(((now - before) / before) * 100, 1);
}

/** A finite number from stored JSON, else null. */
export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Truncates text for a tool answer, marking the cut. */
export function clip(value: unknown, max: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return null;
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Counts rows per key. */
export function countBy<T>(
  rows: Array<T>,
  keyOf: (row: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyOf(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
