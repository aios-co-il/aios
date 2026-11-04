import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type TaggedContact = {
  type: "client" | "lead" | "group" | "unknown";
  id: string;
  senderPhone?: string | null;
};

/** `removed`: the tag's row was deleted; `absent`: the contact did not carry the tag. */
export type TagRemoval = "removed" | "absent";

/** Shown when RLS leaves the row: only its author or a manager may remove it. */
export const TAG_REMOVE_REFUSED =
  "רק מי שהוסיף את התג או מנהל יכולים להסיר אותו";

/** Thrown when the tag's row exists but RLS kept it. */
export class TagRemoveRefusedError extends Error {
  constructor() {
    super(TAG_REMOVE_REFUSED);
    this.name = "TagRemoveRefusedError";
  }
}

type ContactTagsDb = Pick<SupabaseClient<Database>, "from">;

/**
 * Removes a tag from a contact for the whole tenant. There is one row per tag
 * and contact (the unique keys have no user_id), so the delete does not filter
 * by the current user; RLS decides who may remove it. A delete RLS refuses
 * matches no row without an error, so when nothing is deleted the row is
 * looked up (SELECT is tenant-wide): no row means there was nothing to remove,
 * and a row still there is a refusal.
 */
export async function removeContactTag(
  db: ContactTagsDb,
  tenantId: string,
  tagId: string,
  contact: TaggedContact,
): Promise<TagRemoval> {
  const { column, value } = contactKey(contact);
  const { data: removed, error } = await db
    .from("chat_contact_tags")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("tag_id", tagId)
    .eq(column, value)
    .select("id");
  if (error) {
    throw error;
  }
  if (removed.length) {
    return "removed";
  }
  const { data: kept, error: lookupError } = await db
    .from("chat_contact_tags")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("tag_id", tagId)
    .eq(column, value)
    .limit(1);
  if (lookupError) {
    throw lookupError;
  }
  if (kept.length) {
    throw new TagRemoveRefusedError();
  }
  return "absent";
}

/** The `chat_contact_tags` column and value that identify the contact. */
function contactKey(contact: TaggedContact) {
  if (contact.type === "client") {
    return { column: "client_id", value: contact.id } as const;
  }
  if (contact.type === "lead") {
    return { column: "lead_id", value: contact.id } as const;
  }
  if (contact.type === "group") {
    return { column: "group_id", value: contact.id } as const;
  }
  if (contact.senderPhone) {
    return { column: "sender_phone", value: contact.senderPhone } as const;
  }
  throw new Error("אין לאיש הקשר מזהה להסרת התג");
}
