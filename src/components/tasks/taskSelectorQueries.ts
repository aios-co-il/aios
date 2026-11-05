import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";

/** Load clients only after validating the board's tenant scope. */
export async function fetchTaskClients(
  tenantId: string | null | undefined,
  crossTenantAgencyIds: string[],
) {
  const tenant = requireTenantId(tenantId);
  let query = supabase.from("clients").select("id, name, agency_id");
  query = crossTenantAgencyIds.length
    ? query.or(
        `tenant_id.eq.${tenant},agency_id.in.(${crossTenantAgencyIds.join(",")})`,
      )
    : query.eq("tenant_id", tenant);
  const { data, error } = await query.order("name");
  if (error) throw error;
  return data || [];
}

/** Preserve each selector's lead ordering and cross-agency scope. */
export async function fetchTaskLeads(
  tenantId: string | null | undefined,
  crossTenantAgencyIds: string[] = [],
  forBoard = false,
) {
  const tenant = requireTenantId(tenantId);
  let query = supabase
    .from("leads")
    .select("id, company_name, contact_name, created_at");
  query = crossTenantAgencyIds.length
    ? query.or(
        `tenant_id.eq.${tenant},agency_id.in.(${crossTenantAgencyIds.join(",")})`,
      )
    : query.eq("tenant_id", tenant);
  const { data, error } = await (forBoard
    ? query.order("created_at", { ascending: false }).limit(400)
    : query.order("company_name"));
  if (error) throw error;
  return data || [];
}

/** Resolve the fallback agency without issuing an unscoped request. */
export async function fetchFirstTaskAgency(
  tenantId: string | null | undefined,
) {
  const tenant = requireTenantId(tenantId);
  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .eq("tenant_id", tenant)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
