import {
  authorizeTenantPublisher,
  type PublishAccessDb,
  type PublishAccessLookups,
  type PublishCaller,
} from "../_shared/tenant-publish-access.ts";

/** What a user names to publish: one calendar entry, or a work item whose due
 * entries are published. */
export type PublishTargetIds = { entryId?: string; workItemId?: string };

export type UserPublishDecision =
  | { allowed: true; tenantId: string }
  | { allowed: false; status: 401 | 403 | 404; error: string };

type PublishTarget = { tenant_id: string; client_id: string | null };

/** Whether a signed-in user may publish the entry or work item they named: a
 * member of its tenant with access to its client, as social-publish requires
 * (AIO-234). When allowed, returns the tenant the publish is scoped to. */
export async function authorizeUserPublishTarget(
  db: PublishAccessDb,
  caller: PublishCaller,
  ids: PublishTargetIds,
  lookups: PublishAccessLookups,
): Promise<UserPublishDecision> {
  const target = await loadPublishTarget(db, ids);
  if (!target) {
    return {
      allowed: false,
      status: 404,
      error: ids.entryId ? "Entry not found" : "Work item not found",
    };
  }
  const decision = await authorizeTenantPublisher(
    caller,
    target.tenant_id,
    [target.client_id],
    lookups,
  );
  if (!decision.allowed) {
    return decision;
  }
  return { allowed: true, tenantId: target.tenant_id };
}

/** The tenant and client of the named entry, or else of the named work item.
 * A work item without a client is checked for its tenant only. */
async function loadPublishTarget(
  db: PublishAccessDb,
  { entryId, workItemId }: PublishTargetIds,
): Promise<PublishTarget | null> {
  const { data, error } = entryId
    ? await db
        .from("seo_geo_calendar_entries")
        .select("tenant_id,client_id")
        .eq("id", entryId)
        .maybeSingle()
    : await db
        .from("marketing_work_items")
        .select("tenant_id,client_id")
        .eq("id", workItemId)
        .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
