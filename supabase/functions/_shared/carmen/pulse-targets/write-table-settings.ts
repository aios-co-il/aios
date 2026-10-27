import type { JsonObject } from "../../pulse/json.ts";
import type { PulseTargetDb } from "./context.ts";

/**
 * Writes one report table's integration_settings and returns why it was not
 * written, or null. The service role skips RLS, but a table deleted or moved to
 * another tenant since it was read still matches no row and returns no error, so
 * the updated row is selected back: a target is never reported saved on a table
 * that did not take it.
 */
export async function writeTableSettings(
  db: PulseTargetDb,
  {
    tableId,
    tenantIds,
    settings,
  }: { tableId: string; tenantIds: string[]; settings: JsonObject },
): Promise<string | null> {
  const { data, error } = await db
    .from("crm_tables")
    .update({ integration_settings: settings })
    .eq("id", tableId)
    .in("tenant_id", tenantIds)
    .select("id");
  if (error) {
    return error.message;
  }
  return data?.length ? null : TABLE_NOT_WRITTEN;
}

/** The reason Carmen relays when the update matched no table. */
export const TABLE_NOT_WRITTEN =
  "טבלת הקמפיינים לא נמצאה בזמן השמירה, והיעד לא נשמר בה";
