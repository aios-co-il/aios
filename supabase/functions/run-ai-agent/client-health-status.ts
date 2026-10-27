// The mood_status write of Carmen's update_client_health and
// batch_update_client_health tools (AIO-232).

import type { Database } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

type ClientMoodStatus = Database["public"]["Enums"]["client_mood_status"];

/**
 * Sets a client's mood_status within the caller's tenants. A client outside
 * them changes no row, and that throws, so the tool fails before it writes the
 * communication log and card entry instead of reporting a health update that
 * did not happen.
 */
export async function setClientMoodStatus(
  supabase: Pick<DbClient, "from">,
  input: {
    clientId: string;
    moodStatus: ClientMoodStatus;
    accessibleTenantIds: string[];
  },
): Promise<void> {
  const { data, error } = await supabase
    .from("clients")
    .update({ mood_status: input.moodStatus })
    .eq("id", input.clientId)
    .in("tenant_id", input.accessibleTenantIds)
    .select("id");
  if (error) {
    throw error;
  }
  if (!data.length) {
    throw new Error("הלקוח לא נמצא בארגון הזה — מצב הבריאות לא עודכן");
  }
}
