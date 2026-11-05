// The Green API line reads of a text send (AIO-255): the shared sendLine step
// (_shared/report-sender/text-line.ts) falls back to the caller's own line.
import { lineStore } from "../_shared/report-sender/line-store.ts";
import type { LineDeps } from "../_shared/report-sender/text-line.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** LineDeps over the service-role client. */
export function liveLineDeps(admin: DbClient): LineDeps {
  return {
    store: lineStore(admin),
    async ownLine(tenantId, userId) {
      const { data, error } = await admin
        .from("tenant_integrations")
        .select("id, tenant_id, user_id, api_key, settings")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("integration_type", "green_api")
        .eq("is_active", true)
        .limit(2);
      if (error) {
        throw error;
      }
      // With two lines and none named, the caller has to choose one.
      return data.length === 1 ? data[0] : null;
    },
  };
}
