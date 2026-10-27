/**
 * The WhatsApp lines whose client threads the chat collector reads: the
 * tenant's active Green API lines that belong to a tenant owner (the
 * operator's own phone) or are shared with the whole organisation. Carmen's
 * Manus line and Meta business numbers store rows under their own provider
 * and are not read until David decides to monitor them. Nothing is ever sent
 * through these lines.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import { MONITORED_PROVIDER } from "./activity.ts";

/** chat_messages.connection_user_id of each monitored line. */
export async function monitoredConnectionIds(
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
      .eq("role", "owner"),
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

/** The tenant's URL slug, for links into its Chat page. */
export async function tenantSlug(
  db: DbClient,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  throwIf(error, "tenants");
  return data?.slug ?? null;
}
