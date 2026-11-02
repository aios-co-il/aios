import {
  authorizeTenantPublisher,
  type PublishAccessDb,
  type PublishAccessLookups,
  type PublishCaller,
  type PublishDecision,
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

/** One entry's outcome in publish-due's response. */
export type EntryResult = {
  id: string;
  ok: boolean;
  error?: string;
  link?: string;
};

type DueEntry = { id: string; tenant_id: string; client_id: string | null };

/** Splits the due entries into those `caller` may publish and a failed result
 * for each of the others. An entry keeps its own client when its work item's
 * client is changed or cleared, so the check on the named work item does not
 * cover it: each entry needs access to its own client (AIO-234). Each tenant
 * and client pair is decided once. */
export async function splitByClientAccess<E extends DueEntry>(
  caller: PublishCaller,
  entries: E[],
  lookups: PublishAccessLookups,
): Promise<{ publishable: E[]; refused: EntryResult[] }> {
  const decisions = new Map<string, Promise<PublishDecision>>();
  const decide = (entry: E) => {
    const key = `${entry.tenant_id}:${entry.client_id ?? ""}`;
    let decision = decisions.get(key);
    if (!decision) {
      decision = authorizeTenantPublisher(
        caller,
        entry.tenant_id,
        [entry.client_id],
        lookups,
      );
      decisions.set(key, decision);
    }
    return decision;
  };
  const publishable: E[] = [];
  const refused: EntryResult[] = [];
  for (const entry of entries) {
    const decision = await decide(entry);
    if (decision.allowed) {
      publishable.push(entry);
    } else {
      refused.push({ id: entry.id, ok: false, error: decision.error });
    }
  }
  return { publishable, refused };
}
