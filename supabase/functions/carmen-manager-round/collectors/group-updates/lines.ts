/**
 * The WhatsApp lines whose stored group messages the collector reads: the
 * tenant's active Green API lines that belong to an owner or agency owner of
 * the tenant (the operator's own phone), or are shared with the whole
 * organisation (connection_visibility 'org'). A staff member's private line
 * is never read, and neither is Carmen's Manus line, whose rows are stored
 * under its own provider. Nothing is ever sent through these lines.
 *
 * AIO-252's collectors/chat/connections.ts applies the same rule. AIO-252
 * merges first (its migration is dated earlier); AIO-254 then takes develop,
 * reads the lines through that module and deletes this copy before it merges.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";

/** The provider the monitored lines store their rows under. */
export const MONITORED_PROVIDER = "green_api";

/** The roles whose own lines are read (carmen_manager_is_owner's owner level). */
const OWNER_ROLES = ["owner", "agency_owner"] as const;

/** chat_messages.connection_user_id of each monitored line. */
export async function monitoredLineIds(
  db: DbClient,
  tenantId: string,
): Promise<string[]> {
  const [lines, owners] = await Promise.all([
    db
      .from("tenant_integrations")
      .select("user_id, connection_visibility")
      .eq("tenant_id", tenantId)
      .eq("integration_type", MONITORED_PROVIDER)
      .eq("is_active", true),
    db
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("role", [...OWNER_ROLES]),
  ]);
  throwIf(lines.error, "tenant_integrations");
  throwIf(owners.error, "user_roles");
  const ownerIds = new Set((owners.data ?? []).map((row) => row.user_id));
  const ids = (lines.data ?? []).flatMap((line) =>
    line.user_id &&
    (ownerIds.has(line.user_id) || line.connection_visibility === "org")
      ? [line.user_id]
      : [],
  );
  return [...new Set(ids)];
}
