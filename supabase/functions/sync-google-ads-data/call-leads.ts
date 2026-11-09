import { conversionCategorySide } from "./conversion-goal.ts";
import type { GaqlRow, RunGaqlSearch } from "./conversion-gaql.ts";

/**
 * Conversion action types that are a phone call: from an ad's call asset, to
 * the number on the site, a tap on the site's number, and imported calls.
 */
const CALL_ACTION_TYPES = new Set([
  "AD_CALL",
  "WEBSITE_CALL",
  "CLICK_TO_CALL",
  "UPLOAD_CALLS",
]);

/** Leads per campaign/day, keyed `${campaignId}|${date}`. */
export type CampaignDayLeads = {
  /**
   * Phone calls Google left out of `conversions`: every call is a lead, from
   * an ad or from the site, primary or not (David, 2026-11-09). A primary call
   * action is already in conversions, so it adds only what all_conversions
   * holds beyond that.
   */
  uncountedCalls: Map<string, number>;
  /**
   * Every lead, primary or not: calls and lead-category actions (form, contact,
   * signup...). A sales campaign shows them in their own column, apart from
   * its purchases.
   */
  allLeads: Map<string, number>;
};

/** Read the account's calls and leads per campaign and day. */
export async function fetchLeadsByCampaignDay(
  runGaqlSearch: RunGaqlSearch,
  startIso: string,
  endIso: string,
): Promise<CampaignDayLeads> {
  const { callActions, leadActions } = await fetchLeadActions(runGaqlSearch);
  const leads: CampaignDayLeads = {
    uncountedCalls: new Map(),
    allLeads: new Map(),
  };
  if (leadActions.size === 0) {
    return leads;
  }
  const batches = await runGaqlSearch(`
    SELECT
      segments.date,
      campaign.id,
      segments.conversion_action,
      metrics.conversions,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startIso}' AND '${endIso}'
  `);
  for (const row of rowsOf(batches)) {
    const action = row.segments?.conversionAction ?? "";
    if (!leadActions.has(action)) {
      continue;
    }
    const key = `${row.campaign?.id ?? ""}|${row.segments?.date ?? ""}`;
    const all = parseFloat(row.metrics?.allConversions || "0");
    addTo(leads.allLeads, key, all);
    if (callActions.has(action)) {
      addTo(
        leads.uncountedCalls,
        key,
        all - parseFloat(row.metrics?.conversions || "0"),
      );
    }
  }
  return leads;
}

/**
 * Resource names of the account's call actions (a call type, or a site action
 * filed as a phone-call lead, such as a tracked tap on the number) and of its
 * lead actions: the calls plus every lead-category action.
 */
async function fetchLeadActions(runGaqlSearch: RunGaqlSearch) {
  const batches = await runGaqlSearch(`
    SELECT
      conversion_action.resource_name,
      conversion_action.type,
      conversion_action.category
    FROM conversion_action
  `);
  const callActions = new Set<string>();
  const leadActions = new Set<string>();
  for (const row of rowsOf(batches)) {
    const action = row.conversionAction;
    if (!action?.resourceName) {
      continue;
    }
    const isCall =
      CALL_ACTION_TYPES.has(action.type ?? "") ||
      action.category === "PHONE_CALL_LEAD";
    if (isCall) {
      callActions.add(action.resourceName);
    }
    if (isCall || conversionCategorySide(action.category) === "leads") {
      leadActions.add(action.resourceName);
    }
  }
  return { callActions, leadActions };
}

/** Add a positive amount to a key's running total. */
function addTo(totals: Map<string, number>, key: string, amount: number) {
  if (amount > 0) {
    totals.set(key, (totals.get(key) || 0) + amount);
  }
}

/** Every result row of a searchStream response. */
function rowsOf(batches: Awaited<ReturnType<RunGaqlSearch>>): Array<GaqlRow> {
  return batches.flatMap((batch) => batch.results || []);
}
