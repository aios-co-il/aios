// The Manus line reads of a text send (AIO-255): the shared sendLine step
// (_shared/report-sender/text-line.ts) falls back to the caller's oldest
// Manus line.
import { lineStore } from "../_shared/report-sender/line-store.ts";
import { ownManusLine } from "../_shared/report-sender/own-manus-line.ts";
import type { LineDeps } from "../_shared/report-sender/text-line.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** LineDeps over the service-role client. */
export function liveLineDeps(admin: DbClient): LineDeps {
  return {
    store: lineStore(admin),
    ownLine: (tenantId, userId) => ownManusLine(admin, tenantId, userId),
  };
}
