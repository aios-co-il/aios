// Carmen's list_updates tool (AIO-232): the card entries of a client whose
// card the caller's tenant may read, from every org that writes on it, or the
// updates of a lead inside the caller's tenants.

import type { DbClient } from "../_shared/supabase-clients.ts";
import { listClientCardEntries } from "./client-card-list.ts";

interface ListUpdatesInput {
  entityType: unknown;
  entityId: string;
  tenantId: string;
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
      tenantId: input.tenantId,
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
