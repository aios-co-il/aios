import { targetsAtPlace, type CampaignRef } from "./entries.ts";
import type { PulseTarget } from "./kinds.ts";

/** One report table a campaign (or a platform goal) is read from. */
export type PulseTargetPlace = {
  tableId?: string | null;
  /** crm_tables.integration_type: a tie goes to the table built for the goal. */
  integrationType?: string | null;
  settings: unknown;
  campaignId?: string | null;
  campaignName?: string | null;
};

/** The winning target, with the table (and campaign id there) that stores it. */
export type ResolvedPulseTarget = PulseTarget & {
  table_id: string | null;
  campaign_id: string | null;
};

/**
 * The target that applies to a campaign (or, without one, to the whole platform
 * goal) in one table. Approved beats market at any level (a person's decision
 * always wins over Carmen's estimate); then the most specific place wins whole, so
 * a campaign's own CPA beats the platform's ROAS.
 */
export function resolvePulseTarget(
  settings: unknown,
  goal: string,
  campaign: CampaignRef = null,
): PulseTarget | null {
  const found = targetsAtPlace(settings, goal, campaign);
  return (
    found.find((target) => target.source === "approved") || found[0] || null
  );
}

/**
 * The target that applies to one campaign merged from several tables (duplicate
 * Meta tables) or, without a campaign, to the platform goal of several tables.
 * Every table is read with its own campaign id and name. Between tables the order
 * of compareTargets decides, then the most recently set, then the table built for
 * the goal, then the lowest table id, campaign id and campaign name, so every
 * caller gets the same target whatever order it passes the tables in.
 */
export function resolvePulseTargetAcross(
  places: PulseTargetPlace[],
  goal: string,
): ResolvedPulseTarget | null {
  let best: Candidate | null = null;
  for (const place of places || []) {
    const campaign =
      place.campaignId || place.campaignName
        ? { campaignId: place.campaignId, campaignName: place.campaignName }
        : null;
    const own = resolvePulseTarget(place.settings, goal, campaign);
    if (!own) {
      continue;
    }
    const candidate = { target: own, place };
    if (!best || outranks(candidate, best, goal)) {
      best = candidate;
    }
  }
  if (!best) {
    return null;
  }
  return {
    ...best.target,
    table_id: best.place.tableId ?? null,
    // The campaign id this table stores it under (duplicate tables differ).
    campaign_id:
      best.target.scope === "campaign" ? (best.place.campaignId ?? null) : null,
  };
}

/**
 * Negative when `a` takes precedence over `b`: approved before Carmen's market
 * estimate, then the more specific level. 0 when neither wins on those.
 */
export function compareTargets(
  a: Pick<PulseTarget, "source" | "scope">,
  b: Pick<PulseTarget, "source" | "scope">,
): number {
  return (
    Number(a.source !== "approved") - Number(b.source !== "approved") ||
    SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]
  );
}

/**
 * Duplicate Meta tables: the one built for the goal reads it best (lower first).
 * The pulse picks a campaign's sample row and breaks target ties by this rank.
 */
export function pulseTableTypeRank(
  integrationType: string | null | undefined,
  goal: string,
): number {
  if (integrationType === "facebook_ecommerce") {
    return goal === "ecommerce" ? 0 : 1;
  }
  if (integrationType === "facebook_insights") {
    return goal === "ecommerce" ? 1 : 0;
  }
  return 0;
}

type Candidate = { target: PulseTarget; place: PulseTargetPlace };

const SCOPE_RANK: Record<PulseTarget["scope"], number> = {
  campaign: 0,
  platform: 1,
  default: 2,
  table: 3,
};

/**
 * Does candidate `a` beat `b`? compareTargets, then the most recently set, then
 * the table built for the goal, then the lowest table id, campaign id and campaign
 * name (plain code-unit order, the same in Deno and the browser).
 */
function outranks(a: Candidate, b: Candidate, goal: string): boolean {
  const precedence = compareTargets(a.target, b.target);
  if (precedence) {
    return precedence < 0;
  }
  const aSetAt = setAtMs(a.target);
  const bSetAt = setAtMs(b.target);
  if (aSetAt !== bSetAt) {
    return aSetAt > bSetAt;
  }
  const type =
    pulseTableTypeRank(a.place.integrationType, goal) -
    pulseTableTypeRank(b.place.integrationType, goal);
  if (type) {
    return type < 0;
  }
  for (const key of ["tableId", "campaignId", "campaignName"] as const) {
    const x = textKey(a.place[key]);
    const y = textKey(b.place[key]);
    if (x !== y) {
      return x < y;
    }
  }
  return false;
}

/** When the target was set; an undated target counts as the oldest. */
function setAtMs(target: PulseTarget): number {
  const ms = Date.parse(target.set_at || "");
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/** A tie-break key: missing ids sort first. */
function textKey(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
