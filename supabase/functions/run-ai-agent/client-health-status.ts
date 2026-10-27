// The mood_status write of Carmen's update_client_health and
// batch_update_client_health tools (AIO-232).

import type { Database } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

type ClientMoodStatus = Database["public"]["Enums"]["client_mood_status"];

/**
 * Sets a client's mood_status when the caller's tenant may write on it
 * (tenant_can_write_client: its own client, or one of an agency shared with it
 * read_write). Otherwise it throws before any write, so the tool fails before
 * it writes the communication log and card entry instead of reporting a
 * health update that did not happen. A read_only share sees the client but
 * never changes it.
 */
export async function setClientMoodStatus(
  supabase: Pick<DbClient, "from" | "rpc">,
  input: {
    tenantId: string;
    clientId: string;
    moodStatus: ClientMoodStatus;
  },
): Promise<void> {
  const { data: canWrite, error: accessError } = await supabase.rpc(
    "tenant_can_write_client",
    { p_tenant: input.tenantId, p_client: input.clientId },
  );
  if (accessError) {
    throw accessError;
  }
  if (!canWrite) {
    throw new Error("אין לארגון הזה הרשאת עריכה ללקוח — מצב הבריאות לא עודכן");
  }
  const { data, error } = await supabase
    .from("clients")
    .update({ mood_status: input.moodStatus })
    .eq("id", input.clientId)
    .select("id");
  if (error) {
    throw error;
  }
  if (!data.length) {
    throw new Error("הלקוח לא נמצא — מצב הבריאות לא עודכן");
  }
}
