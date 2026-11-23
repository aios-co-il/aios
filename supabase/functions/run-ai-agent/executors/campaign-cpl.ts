import type { MetaNode } from "../meta-response.ts";
import { fbLeadsFromActions } from "./meta-action-leads.ts";

/** Preserves the existing campaign cpl calculation/read. */
export function cplFrom(ins: MetaNode | null | undefined) {
  if (!ins) {
    return null;
  }
  const leadAction = (ins.cost_per_action_type || []).find(
    (a) =>
      [
        "lead",
        "onsite_conversion.lead_grouped",
        "offsite_conversion.fb_pixel_lead",
        "leadgen.other",
      ].includes(a.action_type || "") ||
      String(a.action_type || "").endsWith(".lead"),
  );
  if (leadAction) {
    return Number(leadAction.value);
  }
  const leads = fbLeadsFromActions(ins.actions || []);
  const spend = Number(ins.spend || 0);
  return leads > 0 ? Number((spend / leads).toFixed(2)) : null;
}
