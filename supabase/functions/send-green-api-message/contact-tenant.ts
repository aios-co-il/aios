import type { DbClient } from "../_shared/supabase-clients.ts";

/** Reject mismatched contact references before a message can be sent or stored. */
export async function contactMatchesTenant(
  db: DbClient,
  tenantId: string,
  clientId: string | null | undefined,
  leadId: string | null | undefined,
): Promise<boolean> {
  if (clientId) {
    const { data, error } = await db
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      return false;
    }
  }
  if (leadId) {
    const { data, error } = await db
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      return false;
    }
  }
  return true;
}
