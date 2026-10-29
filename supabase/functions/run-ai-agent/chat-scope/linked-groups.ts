import type { DbClient } from "../../_shared/supabase-clients.ts";
import { uuids } from "./ids.ts";
import { queryRows } from "./query-rows.ts";

/** WhatsApp groups linked to these clients (client row, team channel, Carmen). */
export async function linkedGroupIdsFor(
  supabase: Pick<DbClient, "from">,
  clientIds: "all" | string[],
  tenantIds: string[],
): Promise<string[]> {
  if (clientIds !== "all" && clientIds.length === 0) {
    return [];
  }

  /** Narrows a query to the clients unless the scope covers all of them. */
  const byClient = <Q extends { in(column: string, values: string[]): Q }>(
    q: Q,
    column: string,
  ): Q => (clientIds === "all" ? q : q.in(column, clientIds));
  const [fromClients, fromChannels, fromCarmen] = await Promise.all([
    queryRows(
      byClient(
        supabase
          .from("clients")
          .select("whatsapp_group_id")
          .in("tenant_id", tenantIds)
          .not("whatsapp_group_id", "is", null),
        "id",
      ),
    ),
    queryRows(
      byClient(
        supabase
          .from("team_channel_whatsapp_links")
          .select("whatsapp_group_id")
          .in("tenant_id", tenantIds)
          .not("client_id", "is", null)
          .not("whatsapp_group_id", "is", null),
        "client_id",
      ),
    ),
    queryRows(
      byClient(
        supabase
          .from("carmen_client_group_access")
          .select("whatsapp_group_id")
          .in("tenant_id", tenantIds),
        "client_id",
      ),
    ),
  ]);
  return uuids(
    [...fromClients, ...fromChannels, ...fromCarmen].map(
      (r) => r.whatsapp_group_id,
    ),
  );
}
