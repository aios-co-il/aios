import type { AnalyzeCampaignPerformanceArgs } from "./pulse-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { PerformanceScopeClient } from "./campaign-performance-types.ts";

/** Loads own and explicitly shared agency clients in the original query order. */
export async function loadCampaignPerformanceScope(
  args: AnalyzeCampaignPerformanceArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds } = context;
  let agencyIdsFilter: Array<string> | null = null;
  let agencyNameLabel: string | null = null;
  if (args.agency_id) {
    agencyIdsFilter = [args.agency_id];
  } else if (args.agency_name) {
    const { data: ags } = await supabase
      .from("agencies")
      .select("id, name")
      .in("tenant_id", accessibleTenantIds)
      .ilike("name", `%${args.agency_name}%`);
    agencyIdsFilter = (ags || []).map((a) => a.id);
    agencyNameLabel =
      (ags || []).map((a) => a.name).join(", ") || args.agency_name;
    if (agencyIdsFilter.length === 0) {
      return {
        empty: {
          scope: { agency_name: args.agency_name },
          coverage_summary: { synced: 0, not_connected: 0 },
          synced_clients: [],
          not_connected_clients: [],
          note: `no agency matched "${args.agency_name}"`,
        },
      };
    }
  }

  // Own tenant's clients + shared-tenant clients ONLY within agencies shared via
  // agency_tenant_access. A tenant-wide scope here floods the report with the
  // partner tenant's entire client base and scrambles the per-agency grouping.
  const perfSel = "id, name, agency_id, agencies(name)";
  /** Builds the original tenant-specific client projection. */
  function perfClients(scopeTenantId: string) {
    return supabase
      .from("clients")
      .select(perfSel)
      .eq("tenant_id", scopeTenantId);
  }

  /** Retains the original perfFilters helper. */
  function perfFilters(q: ReturnType<typeof perfClients>) {
    q = q.in("status", ["active"]); // pulse/health reports must exclude paused/ended/onboarding clients
    if (args.client_id) {
      q = q.eq("id", args.client_id);
    }
    if (agencyIdsFilter) {
      q = q.in("agency_id", agencyIdsFilter);
    }
    return q;
  }
  const { data: perfOwn, error: clientsErr } = await perfFilters(
    perfClients(tenantId),
  ).order("name");
  if (clientsErr) {
    throw clientsErr;
  }
  let targetClients: Array<PerformanceScopeClient> = perfOwn || [];
  const { data: perfShares } = await supabase
    .from("agency_tenant_access")
    .select("source_tenant_id, agency_id")
    .eq("accessing_tenant_id", tenantId);
  // Reports pull cross-tenant clients only for agencies the reporting tenant
  // OWNS (its own agency's clients parked in a partner tenant) — not the
  // partner's agencies, whose clients belong in the partner's own report.
  const perfShareAgencyIds = [
    ...new Set((perfShares || []).map((s) => s.agency_id).filter(Boolean)),
  ];
  const perfOwnedAgencies = new Set<string>();
  if (perfShareAgencyIds.length > 0) {
    const { data: ags } = await supabase
      .from("agencies")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", perfShareAgencyIds);
    for (const a of ags || []) {
      perfOwnedAgencies.add(a.id);
    }
  }
  for (const sh of perfShares || []) {
    if (
      !sh.source_tenant_id ||
      sh.source_tenant_id === tenantId ||
      !sh.agency_id
    ) {
      continue;
    }
    if (!perfOwnedAgencies.has(sh.agency_id)) {
      continue;
    }
    const { data: sharedClients } = await perfFilters(
      perfClients(sh.source_tenant_id).eq("agency_id", sh.agency_id),
    );
    if (sharedClients?.length) {
      targetClients = targetClients.concat(sharedClients);
    }
  }

  return { scope: { targetClients, agencyIdsFilter, agencyNameLabel } };
}
