// Audience resolution for the mailing (broadcast) module.
//
// Used by broadcast-enqueue (send snapshot + dry-run preview) and
// broadcast-list-materialize (CRM-filter list preview / freeze). The `db`
// client decides visibility: a user-scoped client respects RLS, a service
// client is trusted and must always be paired with an explicit tenantId.
//
// AudienceFilter (broadcasts.audience_filter, broadcast_lists.source_config):
//   source: 'clients'|'leads'|'campaigners'|'list'|'wa_groups'
//   leads:   stageKeys/stageMode (leads.status), statusKeys/statusMode
//            (response_status), salesPersonIds, agencyIds, tagIds/tagMode
//   clients: statuses/statusMode, serviceTags, agencyIds, campaignerIds
//            (client_team), tagIds/tagMode
//   campaigners: roles, activeOnly
//   list: listId (static members, or a dynamic CRM-filter list's filter)
//   wa_groups: groupIds
//   includeIds / excludeIds: manual pick within a source
//
// Barrel: the implementation lives in ./audience/.
export {
  type AudienceFilter,
  CLIENT_STATUS_LABELS,
  type Recipient,
} from "./audience/types.ts";
export { resolveAudience } from "./audience/resolve.ts";
export { filterReachable, isOptedOut } from "./audience/reachability.ts";
export { recipientForEntity } from "./audience/records.ts";
export { entityMatchesFilter } from "./audience/entity-match.ts";
