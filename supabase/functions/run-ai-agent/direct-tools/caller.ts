import type { AgentDatabaseClient } from "../database-contracts.ts";
/** Resolves tenant/global roles and the campaigner before direct-tool execution. */
export async function resolveDirectCaller(
  supabase: AgentDatabaseClient,
  tenantId: string,
  userId: string | null,
) {
  if (!userId) {
    return {
      userId: null,
      role: null,
      campaignerId: null,
      managedAgencyIds: [] as Array<string>,
    };
  }
  const [{ data: roles }, { data: prof }] = await Promise.all([
    // Roles in this tenant plus global (tenant_id null) roles only — never another tenant's.
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    supabase
      .from("profiles")
      .select("campaigner_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const roleList: Array<string> = (roles || []).map((r) => r.role);
  const order = [
    "super_admin",
    "owner",
    "agency_owner",
    "agency_manager",
    "team_manager",
    "campaigner",
    "sales_person",
    "seo",
    "viewer",
  ];
  const role = order.find((r) => roleList.includes(r)) || null;
  let managedAgencyIds: Array<string> = [];
  if (role === "team_manager" || role === "agency_manager") {
    const { data: mng } = await supabase
      .from("user_managed_agencies")
      .select("agency_id")
      .eq("user_id", userId);
    managedAgencyIds = (mng || []).map((m) => m.agency_id);
  }
  return {
    userId,
    role,
    campaignerId: (prof?.campaigner_id as string | null) || null,
    managedAgencyIds,
  };
}
