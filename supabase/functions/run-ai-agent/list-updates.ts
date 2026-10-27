// Carmen's list_updates tool (AIO-232): a client's card entries or a lead's
// updates, both only inside the caller's tenants.

import type { DbClient } from "../_shared/supabase-clients.ts";
import { listClientCardEntries } from "./client-card-list.ts";

interface ListUpdatesInput {
  entityType: unknown;
  entityId: string;
  accessibleTenantIds: string[];
  limit?: number;
}

/** Carmen's list_updates. For a client, the caller checks callerScope first. */
export async function listUpdates(
  supabase: Pick<DbClient, "from">,
  input: ListUpdatesInput,
) {
  if (input.entityType === "client") {
    return await listClientCardEntries(supabase, {
      clientId: input.entityId,
      accessibleTenantIds: input.accessibleTenantIds,
      limit: input.limit,
    });
  }
  return await listLeadUpdates(supabase, input);
}

/** A lead's updates; a lead outside the caller's tenants is not_found. */
async function listLeadUpdates(
  supabase: Pick<DbClient, "from">,
  input: ListUpdatesInput,
) {
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", input.entityId)
    .in("tenant_id", input.accessibleTenantIds)
    .maybeSingle();
  if (leadError) {
    throw leadError;
  }
  if (!lead) {
    return { error: "not_found", message: "הליד לא נמצא בארגון הזה" };
  }
  const { data, error } = await supabase
    .from("lead_updates")
    .select("id, content, created_at")
    .eq("lead_id", input.entityId)
    .order("created_at", { ascending: false })
    .limit(input.limit || 10);
  if (error) {
    throw error;
  }
  return { count: data.length, updates: data };
}
