/**
 * What the reconciliation measures in a stored or platform record, and when a
 * difference between the two counts as a mismatch (AIO-238).
 */
import { classifyPulseCampaignGoal } from "../pulse-campaign-goals.mjs";
import type { ReconcilePlatform } from "./run-status.ts";
import type { ReconcileTable } from "./types.ts";

/**
 * A difference counts as a mismatch only above max(pct × platform value, floor).
 * The money floor is in the ad account's currency. Result counts get a floor of
 * one: a single late-attributed lead is not a sync bug.
 */
export const RECONCILE_TOLERANCE = { pct: 0.02, money: 20, count: 1 } as const;

export type ReconcileTolerance = {
  pct: number;
  money: number;
  count: number;
};

export type DayMetrics = {
  spend: number;
  leads: number;
  purchases: number;
  conversions: number;
  revenue: number;
};

/** True when |aios − platform| exceeds max(pct × |platform|, floor). */
export function exceedsTolerance(
  aios: number,
  platform: number,
  unit: "money" | "count",
  tolerance: ReconcileTolerance = RECONCILE_TOLERANCE,
): boolean {
  const diff = Math.round(Math.abs(aios - platform) * 1e6) / 1e6;
  const floor = unit === "money" ? tolerance.money : tolerance.count;
  return diff > Math.max(Math.abs(platform) * tolerance.pct, floor);
}

/** Spend / results / revenue of one stored or platform record. */
export function recordMetrics(
  platform: ReconcilePlatform,
  data: Record<string, unknown>,
): DayMetrics {
  if (platform === "google") {
    return {
      spend: num(data.cost ?? data.spend),
      leads: 0,
      purchases: 0,
      conversions: num(data.conversions),
      revenue: num(data.conversions_value),
    };
  }
  return {
    spend: num(data.spend),
    leads: num(data.leads),
    purchases: num(data.purchases),
    conversions: 0,
    revenue: num(data.purchase_value),
  };
}

/** Which result metric is primary for this campaign, or null when it has none. */
export function primaryResultMetric(
  platform: ReconcilePlatform,
  sample: Record<string, unknown> | null,
  table: ReconcileTable,
): "leads" | "purchases" | "conversions" | null {
  if (platform === "google") {
    return "conversions";
  }
  const { goal } = classifyPulseCampaignGoal(sample || {}, {
    integration_type: table.integration_type,
    integration_settings: table.integration_settings || {},
    category: table.category || null,
  });
  if (goal === "ecommerce") {
    return "purchases";
  }
  if (goal === "leads") {
    return "leads";
  }
  return null;
}

/** Stored rows without entity_level are campaign rows (legacy syncs). */
export function isCampaignLevel(data: Record<string, unknown>): boolean {
  return String(data?.entity_level || "campaign").toLowerCase() === "campaign";
}

/** A value rounded to cents, as findings and totals store it. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** All-zero metrics to add days into. */
export function emptyMetrics(): DayMetrics {
  return { spend: 0, leads: 0, purchases: 0, conversions: 0, revenue: 0 };
}

/** Adds `add` into `target`. */
export function addMetrics(target: DayMetrics, add: DayMetrics): void {
  target.spend += add.spend;
  target.leads += add.leads;
  target.purchases += add.purchases;
  target.conversions += add.conversions;
  target.revenue += add.revenue;
}

/** A finite number, or 0. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
