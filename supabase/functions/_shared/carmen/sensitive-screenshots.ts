/**
 * The per-user permission to take a picture of a sensitive page (AIO-656): the act floor
 * (mail, messaging, banks, payments) or a page with a password or payment field. Stored as
 * `sensitive_screenshots` on the user's Carmen permissions row
 * (`carmen_command_center_access`), which the org's manager switches in Carmen's
 * permissions screen. Read for the signed-in user against the org's active Carmen, never
 * from a request, the page or the model: the device contract's `sensitiveScreenshotsAllowed`.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { resolveCarmenAgent } from "../agent-channel/store.ts";

/**
 * Whether the user holds the permission. Off without a row, without an active Carmen, and
 * when anything cannot be read (logged): an unreadable permission is no permission.
 */
export async function sensitiveScreenshotsAllowed(
  sb: Pick<SupabaseClient, "from">,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const carmen = await resolveCarmenAgent(sb, tenantId);
  if (!carmen) {
    return false;
  }
  const { data, error } = await sb
    .from("carmen_command_center_access")
    .select("sensitive_screenshots")
    .eq("tenant_id", tenantId)
    .eq("agent_id", carmen.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      `[carmen] sensitive screenshot permission unreadable for user=${userId}; treated as off`,
      error,
    );
    return false;
  }
  return data?.sensitive_screenshots === true;
}
