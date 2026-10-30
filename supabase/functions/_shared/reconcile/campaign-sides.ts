/**
 * One side of the comparison (stored rows or platform rows) summed per
 * campaign and day (AIO-238).
 */
import {
  addMetrics,
  type DayMetrics,
  emptyMetrics,
  isCampaignLevel,
  recordMetrics,
} from "./metrics.ts";
import type { ReconcilePlatform } from "./run-status.ts";
import type { CampaignDayRow } from "./types.ts";

/** A campaign as findings name it: its id (null for a legacy name-only row) and name. */
export type CampaignRef = { id: string | null; name: string | null };

export type CampaignSide = {
  name: string | null;
  sample: Record<string, unknown> | null;
  days: Map<string, DayMetrics>;
};

/**
 * Campaign-level rows of `dates`, summed per campaign and day, keyed by
 * campaign id (or `name:<name>` for rows without one).
 */
export function groupByCampaign(
  platform: ReconcilePlatform,
  rows: CampaignDayRow[],
  dates: Set<string>,
): Map<string, CampaignSide> {
  const out = new Map<string, CampaignSide>();
  for (const row of rows) {
    if (!dates.has(row.date)) {
      continue;
    }
    if (!isCampaignLevel(row.data)) {
      continue;
    }
    const key = campaignKey(row);
    if (key === "name:") {
      continue;
    }
    const side = out.get(key) || {
      name: row.campaign_name,
      sample: null,
      days: new Map<string, DayMetrics>(),
    };
    side.name = side.name || row.campaign_name;
    if (!side.sample) {
      side.sample = row.data;
    }
    const day = side.days.get(row.date) || emptyMetrics();
    addMetrics(day, recordMetrics(platform, row.data));
    side.days.set(row.date, day);
    out.set(key, side);
  }
  return out;
}

/** Legacy stored rows carry only a name: attach them to the platform id with that name. */
export function rekeyNamedRows(
  aios: Map<string, CampaignSide>,
  platform: Map<string, CampaignSide>,
): void {
  const idByName = new Map<string, string>();
  for (const [id, side] of platform) {
    if (side.name) {
      idByName.set(side.name.trim(), id);
    }
  }
  for (const key of [...aios.keys()]) {
    if (!key.startsWith("name:")) {
      continue;
    }
    const id = idByName.get(key.slice(5));
    const named = aios.get(key);
    if (!id || !named) {
      continue;
    }
    const target = aios.get(id) || {
      name: named.name,
      sample: named.sample,
      days: new Map<string, DayMetrics>(),
    };
    for (const [date, metrics] of named.days) {
      const day = target.days.get(date) || emptyMetrics();
      addMetrics(day, metrics);
      target.days.set(date, day);
    }
    aios.set(id, target);
    aios.delete(key);
  }
}

/** One side's metrics summed over its days, leaving out `skip`. */
export function sideTotal(
  side: CampaignSide | undefined,
  skip: Set<string>,
): DayMetrics {
  const total = emptyMetrics();
  if (!side) {
    return total;
  }
  for (const [date, metrics] of side.days) {
    if (!skip.has(date)) {
      addMetrics(total, metrics);
    }
  }
  return total;
}

/** The campaign id, or `name:<name>` for a legacy row without one. */
function campaignKey(row: CampaignDayRow): string {
  const id = String(row.campaign_id || "").trim();
  if (id) {
    return id;
  }
  return `name:${String(row.campaign_name || "").trim()}`;
}
