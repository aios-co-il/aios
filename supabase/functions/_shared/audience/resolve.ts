// Filter → raw recipients, dispatching on the filter's source.
import { resolveClients, resolveLeads } from "./crm-sources.ts";
import { resolveStaticList } from "./lists.ts";
import { resolveCampaigners, resolveWaGroups } from "./other-sources.ts";
import { hasItems } from "./query.ts";
import {
  type AudienceFilter,
  type Db,
  type Recipient,
  toAudienceFilter,
} from "./types.ts";

/** Resolve a filter to raw recipients (before reachability / opt-outs). */
export async function resolveAudience(
  db: Db,
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
