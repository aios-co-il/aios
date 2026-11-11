import type { ClientToolContext, ClientListArgs } from "./client-contracts.ts";

/** Resolves the original agency and campaigner filters in their existing order. */
export async function resolveClientListScope(
  args: ClientListArgs,
  context: ClientToolContext,
) {
  const {
    supabase,
    accessibleTenantIds,
    callerCampaignerId,
    bypassCampaignerScope,
    isTeamManager,
    managedAgencyIds,
  } = context;

  // --- Scoping rules ---
  // 1. agency_id / agency_name → resolve to agency UUIDs (must be in accessible tenants)
  let agencyIdsFilter: Array<string> | null = null;
  if (args.agency_id) {
    agencyIdsFilter = [args.agency_id];
  } else if (args.agency_name) {
    const { data: ags } = await supabase
      .from("agencies")
      .select("id, name")
      .in("tenant_id", accessibleTenantIds)
      .ilike("name", `%${args.agency_name}%`);
    agencyIdsFilter = (ags || []).map((a) => a.id);
    if (agencyIdsFilter.length === 0) {
      return {
        empty: {
          count: 0,
          clients: [],
          note: `no agency matched "${args.agency_name}"`,
        },
      };
    }
  }

  // 2. campaigner filter (explicit OR auto-scope to caller)
  let campaignerIds: Array<string> | null = null;
  const explicitCampaigner = !!(args.campaigner_id || args.campaigner_name);
  if (args.campaigner_id) {
    campaignerIds = [args.campaigner_id];
  } else if (args.campaigner_name) {
    const { data: camps } = await supabase
      .from("campaigners")
      .select("id, full_name")
      .in("tenant_id", accessibleTenantIds)
      .ilike("full_name", `%${args.campaigner_name}%`);
    campaignerIds = (camps || []).map((c) => c.id);
    if (campaignerIds.length === 0) {
      return {
        empty: {
          count: 0,
          clients: [],
          note: `no campaigner matched "${args.campaigner_name}"`,
        },
      };
    }
  } else if (
    callerCampaignerId &&
    !args.all_scopes &&
    !agencyIdsFilter &&
    !bypassCampaignerScope
  ) {
    // Auto-scope: a campaigner asking via WhatsApp should only see their own clients
    campaignerIds = [callerCampaignerId];
  } else if (
    isTeamManager &&
    !args.all_scopes &&
    !agencyIdsFilter &&
    managedAgencyIds.length > 0
  ) {
    // Team manager scope: limit to clients within agencies they manage
    agencyIdsFilter = managedAgencyIds;
  }

  let clientIdsFilter: Array<string> | null = null;
  if (campaignerIds) {
    const { data: links, error: linkErr } = await supabase
      .from("client_team")
      .select("client_id")
      .in("campaigner_id", campaignerIds);
    if (linkErr) {
      throw linkErr;
    }
    clientIdsFilter = Array.from(
      new Set((links || []).map((l) => l.client_id)),
    );
    if (clientIdsFilter.length === 0) {
      const who = explicitCampaigner ? "this campaigner" : "you";
      return {
        empty: {
          count: 0,
          clients: [],
          note: `no clients assigned to ${who}`,
        },
      };
    }
  }

  return { filters: { agencyIdsFilter, clientIdsFilter, explicitCampaigner } };
}
