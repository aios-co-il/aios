import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type TaggedContact = {
  type: "client" | "lead" | "group" | "unknown";
  id: string;
  senderPhone?: string | null;
};

/** Shown when RLS leaves the row: only its author or a manager may remove it. */
export const TAG_REMOVE_REFUSED =
  "רק מי שהוסיף את התג או מנהל יכולים להסיר אותו";

/**
 * Removes a tag from a contact for the whole tenant. There is one row per tag
 * and contact (the unique keys have no user_id), so the delete does not filter
 * by the current user; RLS decides who may remove it. A delete RLS refuses
 * matches no row without an error, so a zero count is thrown as a refusal.
 */
export async function removeContactTag(
  db: Pick<SupabaseClient<Database>, "from">,
  tenantId: string,
  tagId: string,
  contact: TaggedContact,
): Promise<void> {
  let query = db
    .from("chat_contact_tags")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("tag_id", tagId);
  if (contact.type === "client") {
    query = query.eq("client_id", contact.id);
  } else if (contact.type === "lead") {
    query = query.eq("lead_id", contact.id);
  } else if (contact.type === "group") {
    query = query.eq("group_id", contact.id);
  } else if (contact.senderPhone) {
    query = query.eq("sender_phone", contact.senderPhone);
  } else {
    throw new Error("אין לאיש הקשר מזהה להסרת התג");
  }
  const { data, error } = await query.select("id");
  if (error) {
    throw error;
  }
  if (!data?.length) {
    throw new Error(TAG_REMOVE_REFUSED);
  }
}
