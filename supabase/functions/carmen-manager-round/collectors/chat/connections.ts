/**
 * The WhatsApp lines whose client threads the chat collector reads: the
 * tenant's active Green API lines that belong to an owner or agency owner of
 * the tenant (the operator's own phone), or are shared with the whole
 * organisation (connection_visibility 'org', which every member already sees
 * in Chat). Carmen's Manus line and Meta business numbers store rows under
 * their own provider and are not read until David decides to monitor them.
 * Nothing is ever sent through these lines.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import { MONITORED_PROVIDER } from "./activity.ts";

/** The roles whose own lines are read (carmen_manager_is_owner's owner level). */
const OWNER_ROLES = ["owner", "agency_owner"] as const;

export type MonitoredLines = {
  /** chat_messages.connection_user_id of each monitored line. */
  ids: string[];
  /** Active Green lines left unread: no user, or a private line of a non-owner. */
  skipped: number;
};

/** The monitored lines, and how many active Green lines are not read. */
export async function monitoredLines(
  db: DbClient,
  tenantId: string,
): Promise<MonitoredLines> {
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
  const all = lines.data ?? [];
  const ids = all.flatMap((line) =>
    line.user_id &&
    (ownerIds.has(line.user_id) || line.connection_visibility === "org")
      ? [line.user_id]
      : [],
  );
  return { ids: [...new Set(ids)], skipped: all.length - ids.length };
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
