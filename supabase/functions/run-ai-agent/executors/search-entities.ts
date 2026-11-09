import type { SearchEntitiesArgs } from "./admin-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { searchClientsBroadly } from "../executors/client-search.ts";

/** Preserves the existing search_entities executor and side-effect order. */
export async function executeSearchEntities(
  args: SearchEntitiesArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    callerCampaignerId,
    accessibleTenantIds,
    isTeamManager,
    managedAgencyIds,
    bypassCampaignerScope,
  } = context;

  const tableMap: Record<
    string,
    "agencies" | "clients" | "campaigners" | "sales_people" | "leads"
  > = {
    agency: "agencies",
    client: "clients",
    campaigner: "campaigners",
    sales_person: "sales_people",
    lead: "leads",
  };
  const nameMap: Record<string, string> = {
    agency: "name",
    client: "name",
    campaigner: "full_name",
    sales_person: "full_name",
    lead: "company_name",
  };
  const table = tableMap[args.entity_type];
  const nameField = nameMap[args.entity_type];

  // Clients: broad alias + ad-account + inactive/ended search (Kernelios/Cornelius/קרנליוס…).
  if (args.entity_type === "client") {
    let clientIdsFilter: Array<string> | null = null;
    if (callerCampaignerId && !args.all_scopes && !bypassCampaignerScope) {
      const { data: links } = await supabase
        .from("client_team")
        .select("client_id")
        .eq("campaigner_id", callerCampaignerId);
      clientIdsFilter = (links || []).map((l) => l.client_id);
      if (clientIdsFilter.length === 0) {
        return {
          count: 0,
          results: [],
          note: "no clients assigned to you",
        };
      }
    }
    const agencyFilter =
      args.agency_id ||
      (isTeamManager && !args.all_scopes && managedAgencyIds.length === 1
        ? managedAgencyIds[0]
        : null);
    const results = await searchClientsBroadly(
      supabase,
      accessibleTenantIds,
      args.search_term,
      {
        limit: 20,
        agencyId: agencyFilter,
        clientIdsFilter:
          isTeamManager &&
          !args.all_scopes &&
          managedAgencyIds.length > 1 &&
          !args.agency_id
            ? null
            : clientIdsFilter,
      },
    );
    const filtered =
      isTeamManager &&
      !args.all_scopes &&
      managedAgencyIds.length > 0 &&
      !args.agency_id
        ? results.filter(
            (r) => r.agency_id && managedAgencyIds.includes(r.agency_id),
          )
        : results;
    return {
      count: filtered.length,
      results: filtered,
      note: "includes active+ended/paused, CRM name aliases, and Meta/Google ad-account / report-table name matches",
    };
  }

  const selectCols =
    args.entity_type === "lead"
      ? `id, ${nameField}, agency_id`
      : args.entity_type === "campaigner" || args.entity_type === "sales_person"
        ? `id, ${nameField}, phone, email`
        : `id, ${nameField}`;
  let q = supabase
    .from(table)
    .select(selectCols)
    .in("tenant_id", accessibleTenantIds)
    .ilike(nameField, `%${args.search_term}%`)
    .limit(20);
  if (args.entity_type === "lead" && args.agency_id) {
    q = q.eq("agency_id", args.agency_id);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data.length, results: data };
}
