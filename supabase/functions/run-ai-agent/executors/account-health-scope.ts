import type { CheckAdAccountsHealthArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Loads own and specifically shared clients with the existing health fallback behavior. */
export async function loadAccountHealthClients(
  args: CheckAdAccountsHealthArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;
  const db: AgentDatabaseClient = supabase;
  const healthSel = "id, name, agency_id, meta_ads_account_id, agencies(name)";
  /** Retains the original healthClients helper. */
  function healthClients(scopeTenantId: string) {
    return db.from("clients").select(healthSel).eq("tenant_id", scopeTenantId);
  }
  /** Retains the original healthFilters helper. */
  function healthFilters(q: ReturnType<typeof healthClients>) {
    q = q.in("status", ["active"]); // pulse/health reports must exclude paused/ended/onboarding clients
    if (args.client_id) {
      q = q.eq("id", args.client_id);
    }
    if (args.agency_id) {
      q = q.eq("agency_id", args.agency_id);
    }
    return q;
  }
  const { data: healthOwn } = await healthFilters(
    healthClients(tenantId),
  ).order("name");
  let scopeClients = healthOwn || [];
  const { data: healthShares } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id, agency_id")
    .eq("accessing_tenant_id", tenantId);
  // Same ownership rule as analyze_campaign_performance above.
  const healthShareAgencyIds = [
    ...new Set(
      (healthShares || [])
        .map((s) => s.agency_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const healthOwnedAgencies = new Set<string>();
  if (healthShareAgencyIds.length > 0) {
    const { data: ags } = await db
      .from("agencies")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", healthShareAgencyIds);
    for (const a of ags || []) {
      healthOwnedAgencies.add(a.id);
    }
  }
  for (const sh of healthShares || []) {
    if (
      !sh.source_tenant_id ||
      sh.source_tenant_id === tenantId ||
      !sh.agency_id
    ) {
      continue;
    }
    if (!healthOwnedAgencies.has(sh.agency_id)) {
      continue;
    }
    const { data: sharedClients } = await healthFilters(
      healthClients(sh.source_tenant_id).eq("agency_id", sh.agency_id),
    );
    if (sharedClients?.length) {
      scopeClients = scopeClients.concat(sharedClients);
    }
  }

  return scopeClients;
}
