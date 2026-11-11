import type { KpiDelta } from "./ReportKpiCard";

/**
 * A headline figure's change against the previous period, for a KPI card.
 * None while the comparison is off, when either value is missing, or when
 * the previous one is 0 (a change from nothing has no percentage).
 */
export function kpiChange(
  now: number | null,
  before: number | null | undefined,
  goodWhen: KpiDelta["goodWhen"],
): KpiDelta | undefined {
  if (now === null || before === null || before === undefined) {
    return undefined;
  }
  if (before === 0) {
    return undefined;
  }
  return { value: now / before - 1, goodWhen };
}
