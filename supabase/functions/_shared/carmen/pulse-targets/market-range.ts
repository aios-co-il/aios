import type { JsonObject } from "../../pulse/json.ts";
import { pulseTargetKindLabel } from "../../pulse/targets/kinds.ts";
import type { TargetInput } from "./parse-target-input.ts";

/** A market estimate must stay within this share of the client's own 7-day baseline. */
export const MARKET_TARGET_MAX_DEVIATION = 0.5;

/** "±50%", as the tool description and the refusal state the range. */
export const MARKET_RANGE_TEXT = `±${MARKET_TARGET_MAX_DEVIATION * 100}%`;

/**
 * The refusal when a market estimate is far from the client's own history: it
 * would alert at once (or never), so that call belongs to a person. Null when the
 * value is in range or the pulse has no baseline.
 */
export function marketRangeProblem(rows: JsonObject[], input: TargetInput) {
  const baseline = ownBaseline(rows, input);
  if (
    baseline === null ||
    (input.value >= baseline * (1 - MARKET_TARGET_MAX_DEVIATION) &&
      input.value <= baseline * (1 + MARKET_TARGET_MAX_DEVIATION))
  ) {
    return null;
  }
  const low = roundCents(baseline * (1 - MARKET_TARGET_MAX_DEVIATION));
  const high = roundCents(baseline * (1 + MARKET_TARGET_MAX_DEVIATION));
  return {
    success: false,
    error: "value_out_of_range",
    baseline: roundCents(baseline),
    allowed_range: [low, high],
    message: `יעד שוק חייב להיות בטווח של ${MARKET_RANGE_TEXT} מהבסיס של הלקוח (${pulseTargetKindLabel(input.kind)} ${low}–${high}). יעד רחוק יותר — הציעי אותו למשתמש עם set_pulse_target, באישור.`,
  };
}

/**
 * The client's own 7-day baseline for this target from the latest pulse: the
 * campaign's, or the spend-weighted one of the platform's campaigns of that goal.
 * Only rows measured on the same metric count (an ecommerce row is measured on
 * ROAS unless it has a CPA target). Null when the pulse has none.
 */
export function ownBaseline(
  rows: JsonObject[],
  input: TargetInput,
): number | null {
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    if (!measuresTarget(row, input)) {
      continue;
    }
    const baseline = Number(row.baseline_efficiency_7d);
    const spend = Number(row.spend_7d);
    if (baseline > 0 && spend > 0) {
      weighted += baseline * spend;
      weight += spend;
    }
  }
  return weight > 0 ? weighted / weight : null;
}

/** Is this pulse row the target's campaign (or one of its platform goal), on the same metric? */
function measuresTarget(row: JsonObject, input: TargetInput): boolean {
  if (row.platform !== input.platform || row.goal !== input.goal) {
    return false;
  }
  if (input.campaignId && String(row.campaign_id ?? "") !== input.campaignId) {
    return false;
  }
  const measured =
    row.goal === "ecommerce"
      ? row.target_kind === "cpa"
        ? "cpa"
        : "roas"
      : "cpl";
  return measured === input.kind;
}

/** Rounded to 2 decimals. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
