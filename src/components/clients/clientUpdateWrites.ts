import { supabase } from "@/integrations/supabase/client";

/**
 * Edits a card entry's text. RLS skips a row the user may not edit without an
 * error, so an edit that changed no row throws instead of reporting success.
 */
export async function editClientUpdate(
  id: string,
  content: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("client_updates")
    .update({ content })
    .eq("id", id)
    .select("id");
  if (error) {
    throw error;
  }
  requireChangedRow(data, "edit", id);
}

/** Deletes a card entry; throws when RLS left the row in place. */
export async function deleteClientUpdate(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("client_updates")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    throw error;
  }
  requireChangedRow(data, "delete", id);
}

/** Throws when a write matched no row: RLS refused it or the row is gone. */
function requireChangedRow(
  rows: { id: string }[] | null,
  action: "edit" | "delete",
  id: string,
): void {
  if (!rows?.length) {
    throw new Error(`client_updates ${action} of ${id} changed no row`);
  }
}
