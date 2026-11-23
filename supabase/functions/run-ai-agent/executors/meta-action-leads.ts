import type { MetaAction } from "../meta-response.ts";

// Pull the lead count out of an insights row's `actions` array (Meta reports leads
// under a few action types depending on the form/CAPI setup).
/** Retains the existing fbLeadsFromActions behavior. */
export function fbLeadsFromActions(
  actions: Array<MetaAction> | null | undefined,
): number {
  if (!Array.isArray(actions)) {
    return 0;
  }
  let leads = 0;
  for (const a of actions) {
    const t = String(a?.action_type || "");
    if (
      t === "lead" ||
      t === "leadgen.other" ||
      t === "onsite_conversion.lead_grouped" ||
      t.endsWith(".lead")
    ) {
      leads += Number(a?.value || 0);
    }
  }
  return leads;
}
