import type { SharedAgencyAccessRow } from "./contracts.ts";
import type { RosterRow } from "./contracts.ts";
import type { RunState } from "./state.ts";
/** load Run Tenant Data in the original run order. */
export async function loadRunTenantData(
  run: RunState,
): Promise<Response | string | void> {
  let tenantRes;
  [tenantRes, run.agenciesRes, run.statsRes, run.memoryRes, run.teamRosterRes] =
    await Promise.all([
      run.supabase
        .from("tenants")
        .select("name, type")
        .eq("id", run.resolvedTenantId)
        .single()
        .returns<{ name: string; type?: string }>(),
      run.supabase
        .from("agencies")
        .select("id, name, tenant_id")
        .eq("tenant_id", run.resolvedTenantId)
        .order("name")
        .limit(50),
      Promise.all([
        // leads: rows needed for the per-status breakdown (status column only).
        run.supabase
          .from("leads")
          .select("status", { count: "exact", head: false })
          .eq("tenant_id", run.resolvedTenantId),
        // clients/tasks: only the count is used — head:true skips row payloads.
        run.supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", run.resolvedTenantId),
        run.supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", run.resolvedTenantId)
          .eq("status", "open"),
      ]),
      run.tokenOptimize
        ? run.supabase
            .from("ai_memory")
            .select("key, content, category")
            .eq("tenant_id", run.resolvedTenantId)
            .eq("category", "instructions")
            .order("updated_at", { ascending: false })
            .limit(25)
        : run.supabase
            .from("ai_memory")
            .select("key, content, category")
            .eq("tenant_id", run.resolvedTenantId)
            .order("updated_at", { ascending: false })
            .limit(30),
      run.tokenOptimize
        ? Promise.resolve({ data: [] as Array<RosterRow> })
        : run.supabase
            .from("campaigners")
            .select("id, full_name, phone, email, role")
            .eq("tenant_id", run.resolvedTenantId)
            .order("full_name")
            .limit(50),
    ]);
  run.tenantName = tenantRes.data?.name || "הארגון";
  // Resolve shared agencies from other tenants accessible to us
  const { data: sharedAccess } = await run.supabase
    .from("agency_tenant_access")
    .select(
      "agency_id, source_tenant_id, agencies(name), tenants:source_tenant_id(name)",
    )
    .eq("accessing_tenant_id", run.resolvedTenantId)
    .returns<Array<SharedAgencyAccessRow>>();
  run.sharedAgencies = (sharedAccess || []).map((s) => ({
    id: s.agency_id,
    name: s.agencies?.name || "agency",
    source_tenant_id: s.source_tenant_id,
    source_tenant_name: s.tenants?.name || "other-tenant",
  }));
  run.memoryTenantIds = Array.from(
    new Set([
      run.resolvedTenantId,
      ...run.sharedAgencies.map((agency) => agency.source_tenant_id),
    ]),
  );
}
