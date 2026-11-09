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

/**
 * Per campaign/day (`${campaignId}|${date}`), the phone calls Google left out of
 * `conversions`: every call is a lead, from an ad or from the site, primary or
 * not (David, 2026-11-09). A call action counted as primary is already in
 * conversions, so it adds only what all_conversions holds beyond that.
 */
export async function fetchUncountedCallsByCampaignDay(
  runGaqlSearch: RunGaqlSearch,
  startIso: string,
  endIso: string,
): Promise<Map<string, number>> {
  const callActions = await fetchCallActions(runGaqlSearch);
  const calls = new Map<string, number>();
  if (callActions.size === 0) {
    return calls;
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
    if (!callActions.has(row.segments?.conversionAction ?? "")) {
      continue;
    }
    const uncounted =
      parseFloat(row.metrics?.allConversions || "0") -
      parseFloat(row.metrics?.conversions || "0");
    if (uncounted > 0) {
      const key = `${row.campaign?.id ?? ""}|${row.segments?.date ?? ""}`;
      calls.set(key, (calls.get(key) || 0) + uncounted);
    }
  }
  return calls;
}

/**
 * Resource names of the account's call conversion actions: a call type, or a
 * site action filed as a phone-call lead (a tracked tap on the number).
 */
async function fetchCallActions(
  runGaqlSearch: RunGaqlSearch,
): Promise<Set<string>> {
  const batches = await runGaqlSearch(`
    SELECT
      conversion_action.resource_name,
      conversion_action.type,
      conversion_action.category
    FROM conversion_action
  `);
  const actions = new Set<string>();
  for (const row of rowsOf(batches)) {
    const action = row.conversionAction;
    if (
      action?.resourceName &&
      (CALL_ACTION_TYPES.has(action.type ?? "") ||
        action.category === "PHONE_CALL_LEAD")
    ) {
      actions.add(action.resourceName);
    }
  }
  return actions;
}

/** Every result row of a searchStream response. */
function rowsOf(batches: Awaited<ReturnType<RunGaqlSearch>>): Array<GaqlRow> {
  return batches.flatMap((batch) => batch.results || []);
}
