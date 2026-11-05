/** A target's metric: cost per lead, cost per purchase, return on ad spend or cost per result. */
export type PulseTargetKind = "cpl" | "roas" | "cpa" | "cost_per_result";

/** Who set a target: a person ("approved") or Carmen's market estimate. */
export type PulseTargetSource = "approved" | "carmen_market";

/** Where a target is stored, most specific first. */
export type PulseTargetScope = "campaign" | "platform" | "default" | "table";

/** One target as the pulse reads it from a table's settings. */
export type PulseTarget = {
  value: number;
  kind: PulseTargetKind;
  direction: "minimum" | "maximum";
  source: PulseTargetSource;
  scope: PulseTargetScope;
  rationale: string | null;
  set_at: string | null;
  set_by: string | null;
};

/** The goals a person or Carmen sets a cost target for. */
export const PULSE_TARGET_GOALS = ["leads", "ecommerce"] as const;

/** A goal a cost target can be set for. */
export type PulseTargetGoal = (typeof PULSE_TARGET_GOALS)[number];

/** Is this a goal a cost target can be set for (leads or ecommerce)? */
export function isPulseTargetGoal(value: unknown): value is PulseTargetGoal {
  return PULSE_TARGET_GOALS.some((goal) => goal === value);
}

/** The target kinds a goal is measured on, the default first. */
export function pulseTargetKindsForGoal(
  goal: string,
): readonly PulseTargetKind[] {
  return TARGET_KINDS_BY_GOAL.get(goal) ?? [];
}

/**
 * The metric a campaign of this goal is measured on: its target's kind when the
 * goal is measured on that kind, else the goal's default (ROAS for ecommerce).
 * A goal with no target kinds is measured on cost per result.
 */
export function pulseMeasuredKind(
  goal: string,
  targetKind: unknown,
): PulseTargetKind {
  const kinds = pulseTargetKindsForGoal(goal);
  return (
    kinds.find((kind) => kind === targetKind) ?? kinds[0] ?? "cost_per_result"
  );
}

/** Is this one of the four target kinds? */
export function isTargetKind(value: unknown): value is PulseTargetKind {
  return TARGET_KINDS.some((kind) => kind === value);
}

/** ROAS is a floor; every cost kind is a ceiling. */
export function pulseTargetDirection(
  kind: PulseTargetKind,
): "minimum" | "maximum" {
  return kind === "roas" ? "minimum" : "maximum";
}

/** The kind's name in alerts and the dashboard. */
export function pulseTargetKindLabel(kind: string | null | undefined): string {
  if (kind === "roas") {
    return "ROAS";
  }
  if (kind === "cpa") {
    return "CPA";
  }
  if (kind === "cpl") {
    return "CPL";
  }
  return "עלות לתוצאה";
}

/** Anything but Carmen's market estimate was set by a person. */
export function normalizeTargetSource(raw: unknown): PulseTargetSource {
  return String(raw || "").trim() === "carmen_market"
    ? "carmen_market"
    : "approved";
}

/** "יעד מאושר" / "יעד שוק (כרמן)", shown wherever a target is named. */
export function pulseTargetSourceLabel(source: unknown): string {
  return normalizeTargetSource(source) === "carmen_market"
    ? "יעד שוק (כרמן)"
    : "יעד מאושר";
}

const TARGET_KINDS: readonly PulseTargetKind[] = [
  "cpl",
  "roas",
  "cpa",
  "cost_per_result",
];

const TARGET_KINDS_BY_GOAL = new Map<string, readonly PulseTargetKind[]>([
  ["ecommerce", ["roas", "cpa"]],
  ["leads", ["cpl"]],
  ["engagement", ["cost_per_result"]],
]);
