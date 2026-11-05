import type { LeadOwner, LeadScope } from "./types.ts";

/** Whether the lead scope can match any lead at all. */
export function hasLeadAccess(leads: LeadScope): boolean {
  return leads.all || leads.agencyIds.length > 0 || !!leads.salesPersonId;
}

/** Whether a lead (by its agency and salesperson) is inside the lead scope. */
export function leadInScope(
  owner: LeadOwner | null | undefined,
  leads: LeadScope,
): boolean {
  return (
    leads.all ||
    (!!owner &&
      ((!!owner.agency_id && leads.agencyIds.includes(owner.agency_id)) ||
        (!!leads.salesPersonId &&
          owner.sales_person_id === leads.salesPersonId)))
  );
}
