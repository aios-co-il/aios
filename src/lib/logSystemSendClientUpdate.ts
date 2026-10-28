import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

/**
 * Logs something AIOS sent to a client on the client card as source
 * system_send, so it shows the "נשלח מהמערכת" chip and never counts as client
 * contact, whatever the text says. Skips the write when nobody is signed in
 * (user_id is required) and returns the insert error, if any.
 */
export async function logSystemSendClientUpdate(entry: {
  tenantId: string;
  clientId: string;
  content: string;
  updateType: string;
  metadata?: Json;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const row: TablesInsert<"client_updates"> = {
    tenant_id: entry.tenantId,
    client_id: entry.clientId,
    user_id: user.id,
    content: entry.content,
    update_type: entry.updateType,
    source: "system_send",
    metadata: entry.metadata,
  };
  const { error } = await supabase.from("client_updates").insert(row);
  return error;
}
