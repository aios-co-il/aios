import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Loads every contact-tag link in the tenant for the chat list. Scoped by tenant, not by the
 * user who added the tag, so teammates see the same tags on a contact; RLS already allows
 * tenant-wide SELECT on chat_contact_tags.
 */
export async function fetchTenantContactTags(
  db: SupabaseClient<Database>,
  tenantId: string,
) {
  const { data, error } = await db
    .from("chat_contact_tags")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Error fetching contact tags:", error);
    return [];
  }
  return data ?? [];
}
