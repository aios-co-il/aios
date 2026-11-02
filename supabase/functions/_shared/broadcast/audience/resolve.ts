// Audience resolution for the mailing (broadcast) module: filter → raw
// recipients, dispatching on the filter's source.
//
// Used by broadcast-enqueue (send snapshot + dry-run preview) and
// broadcast-list-materialize (CRM-filter list preview / refresh). The `db`
// client decides visibility: a user-scoped client respects RLS, a service
// client is trusted and must always be paired with an explicit tenantId.
//
// AudienceFilter (broadcasts.audience_filter, broadcast_lists.source_config):
//   source: 'clients'|'leads'|'campaigners'|'list'|'wa_groups'
//   leads/clients matching is the broadcast_matching_entity_ids RPC.
//   leads:   stageKeys/stageMode (leads.status), statusKeys/statusMode
//            (response_status), salesPersonIds, agencyIds, tagIds/tagMode
//   clients: statuses/statusMode, serviceTags, agencyIds, campaignerIds
//            (client_team), tagIds/tagMode
//   campaigners: roles, activeOnly
//   list: listId (members of a static / synced list, or a dynamic CRM-filter
//         list's filter resolved live)
//   wa_groups: groupIds
//   manual: manualContacts (typed emails / phones, no CRM record)
//   includeIds / excludeIds: manual pick within a source
import { resolveClients, resolveLeads } from "./crm-sources.ts";
import { resolveStaticList } from "./lists.ts";
import {
  resolveCampaigners,
  resolveManualContacts,
  resolveWaGroups,
} from "./other-sources.ts";
import { hasItems } from "./query.ts";
import {
  type AudienceDb,
  type AudienceFilter,
  type Recipient,
  toAudienceFilter,
} from "./types.ts";

/** Resolve a filter to raw recipients (before reachability / opt-outs). */
export async function resolveAudience(
  db: AudienceDb,
  tenantId: string,
  filter: AudienceFilter,
  depth = 0,
): Promise<Recipient[]> {
  if (!filter?.source) throw new Error("missing_filter_source");
  let recipients: Recipient[];
  switch (filter.source) {
    case "leads":
      recipients = await resolveLeads(db, tenantId, filter);
      break;
    case "clients":
      recipients = await resolveClients(db, tenantId, filter);
      break;
    case "campaigners":
      recipients = await resolveCampaigners(db, tenantId, filter);
      break;
    case "wa_groups":
      return resolveWaGroups(db, tenantId, filter);
    case "manual":
      recipients = resolveManualContacts(filter);
      break;
    case "list": {
      if (!filter.listId) throw new Error("missing_listId");
      const { data: list, error } = await db
        .from("broadcast_lists")
        .select("id, source, source_config, kind")
        .eq("tenant_id", tenantId)
        .eq("id", filter.listId)
        .maybeSingle();
      if (error) throw error;
      if (!list) throw new Error("list_not_found");
      const cfg = toAudienceFilter(list.source_config);
      // Dynamic CRM-filter lists are resolved live; never nest list → list.
      if (
        list.source === "crm_filter" &&
        list.kind === "dynamic" &&
        cfg?.source &&
        cfg.source !== "list"
      ) {
        if (depth > 0) throw new Error("nested_list");
        recipients = await resolveAudience(db, tenantId, cfg, depth + 1);
      } else {
        recipients = await resolveStaticList(db, tenantId, filter.listId);
      }
      break;
    }
    default:
      throw new Error("unknown_source");
  }

  if (hasItems(filter.includeIds)) {
    const inc = new Set(filter.includeIds);
    recipients = recipients.filter((r) => r.entity_id && inc.has(r.entity_id));
  }
  if (hasItems(filter.excludeIds)) {
    const exc = new Set(filter.excludeIds);
    recipients = recipients.filter(
      (r) => !r.entity_id || !exc.has(r.entity_id),
    );
  }
  return recipients;
}
