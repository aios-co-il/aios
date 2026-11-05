import type { Database } from "@/integrations/supabase/types";
import { requireTenantId } from "@/lib/requireTenantId";

/** Validate every assignment's tenant before the bulk write can begin. */
export function buildLeadSalesPersonAssignments(
  leads: Array<
    Pick<Database["public"]["Tables"]["leads"]["Row"], "id" | "tenant_id">
  >,
  salesPersonIds: Array<string>,
): Array<Database["public"]["Tables"]["lead_sales_people"]["Insert"]> {
  return leads.flatMap((lead) =>
    salesPersonIds.map((salesPersonId) => ({
      lead_id: lead.id,
      sales_person_id: salesPersonId,
      tenant_id: requireTenantId(lead.tenant_id),
    })),
  );
}
