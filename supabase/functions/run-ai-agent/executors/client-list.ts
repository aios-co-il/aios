import type { ClientToolContext, ClientListArgs } from "./client-contracts.ts";
import { resolveClientListScope } from "./client-list-scope.ts";
import { searchClientsBroadly } from "./client-search.ts";

/** Lists clients with the same explicit filters and caller-scope defaults. */
export async function listClients(
  args: ClientListArgs,
  context: ClientToolContext,
) {
  const { supabase, accessibleTenantIds, callerCampaignerId } = context;
  const scope = await resolveClientListScope(args, context);
  if ("empty" in scope) {
    return scope.empty;
  }
  const { agencyIdsFilter, clientIdsFilter, explicitCampaigner } =
    scope.filters;
  let query = supabase
    .from("clients")
    .select("id, name, contact_name, phone, status, agency_id, agencies(name)")
    .in("tenant_id", accessibleTenantIds)
    .order("name")
    .limit(args.limit || 50);

  // Default status for auto-scoped campaigner queries: active + onboarding only
  if (args.status) {
    query = query.eq("status", args.status);
  } else if (callerCampaignerId && !args.all_scopes && !explicitCampaigner) {
    query = query.in("status", ["active", "onboarding"]);
  }

  if (agencyIdsFilter) {
    query = query.in("agency_id", agencyIdsFilter);
  }
  if (clientIdsFilter) {
    query = query.in("id", clientIdsFilter);
  }
  if (args.name_search) {
    // Broad search: aliases, ad-account names, ended duplicates — not active-only.
    const broadRaw = await searchClientsBroadly(
      supabase,
      accessibleTenantIds,
      args.name_search,
      {
        limit: Math.max(args.limit || 50, 50),
        agencyId: agencyIdsFilter?.length === 1 ? agencyIdsFilter[0] : null,
        clientIdsFilter,
      },
    );
    const broad =
      agencyIdsFilter && agencyIdsFilter.length > 1
        ? broadRaw.filter(
            (c) => c.agency_id && agencyIdsFilter.includes(c.agency_id),
          )
        : broadRaw;
    const scope_note =
      callerCampaignerId &&
      !args.all_scopes &&
      !explicitCampaigner &&
      !agencyIdsFilter
        ? "auto-scoped to caller campaigner. name_search includes ended/paused + Meta ad account aliases."
        : "name_search includes ended/paused clients and Meta/Google report / ad-account name matches.";
    return {
      count: broad.length,
      clients: broad.slice(0, args.limit || 50).map((c) => ({
        id: c.id,
        name: c.name,
        contact_name: c.contact_name,
        phone: c.phone,
        status: c.status,
        agency_id: c.agency_id,
        agency_name: c.agency_name,
        matched_via: c.matched_via,
        ad_accounts: c.ad_accounts,
      })),
      scope_note,
    };
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const enriched = (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    contact_name: c.contact_name,
    phone: c.phone,
    status: c.status,
    agency_id: c.agency_id,
    agency_name: c.agencies?.name ?? null,
  }));
  const scope_note =
    callerCampaignerId &&
    !args.all_scopes &&
    !explicitCampaigner &&
    !agencyIdsFilter
      ? "auto-scoped to caller campaigner (active+onboarding only). pass all_scopes=true or explicit campaigner_name/agency_name to widen."
      : undefined;
  return { count: enriched.length, clients: enriched, scope_note };
}
