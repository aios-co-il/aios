import { supabase } from "@/integrations/supabase/client";

/** One site the user trusted for a conversation from a click or typing card in the extension's panel (AIO-656). */
export type TrustedSite = { id: string; origin: string };

/**
 * The sites the signed-in user trusted for this conversation. Row-level security returns
 * only their own rows in an org they belong to; carmen-device-action alone writes them.
 */
export async function listTrustedSites(
  conversationId: string,
): Promise<Array<TrustedSite>> {
  const { data, error } = await supabase
    .from("carmen_device_trusted_sites")
    .select("id, origin")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Ends one trust: the next click or type on that site asks on its card again. */
export async function revokeTrustedSite(id: string): Promise<void> {
  const { error } = await supabase
    .from("carmen_device_trusted_sites")
    .delete()
    .eq("id", id);
  if (error) {
    throw error;
  }
}
