import { supabase } from "@/integrations/supabase/client";

/** The signed-in user or tenant id; saving without one is a bug, so it throws. */
export function requireId(id: string | null | undefined): string {
  if (!id) {
    throw new Error("No signed-in user or organization to save the order for");
  }
  return id;
}

/** The user's saved CRM column order, or null when they have none. */
export async function fetchColumnOrder(
  tenantId: string,
  userId: string,
): Promise<Array<string> | null> {
  const { data, error } = await supabase
    .from("lead_list_defaults")
    .select("column_order")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.column_order ?? null;
}

/**
 * Upserts the user's own row. Only column_order is sent, so a saved stage scope
 * stays as it was; RLS refuses any other user or tenant.
 */
export async function saveColumnOrder(
  tenantId: string,
  userId: string,
  order: Array<string>,
): Promise<void> {
  const { error } = await supabase
    .from("lead_list_defaults")
    .upsert(
      { tenant_id: tenantId, user_id: userId, column_order: order },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) {
    throw error;
  }
}

/**
 * Moves the browser's old order to the account only where the account has none,
 * and returns the order the account ends up with. Each write is conditional in
 * the database (insert-if-missing, then update-where-empty), so an order another
 * tab saved in between is never overwritten.
 */
export async function migrateColumnOrder(
  tenantId: string,
  userId: string,
  order: Array<string>,
): Promise<Array<string>> {
  const current = await fetchColumnOrder(tenantId, userId);
  if (current !== null) {
    return current;
  }
  const { error: insertError } = await supabase
    .from("lead_list_defaults")
    .upsert(
      { tenant_id: tenantId, user_id: userId, column_order: order },
      { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
    );
  if (insertError) {
    throw insertError;
  }
  const { error: updateError } = await supabase
    .from("lead_list_defaults")
    .update({ column_order: order })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("column_order", null);
  if (updateError) {
    throw updateError;
  }
  return (await fetchColumnOrder(tenantId, userId)) ?? order;
}
