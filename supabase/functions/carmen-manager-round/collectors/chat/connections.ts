/**
 * The WhatsApp lines whose client threads the chat collector reads: the
 * tenant's active Green API lines that belong to a member of the tenant
 * (owners, agency owners, campaigners and other staff, through tenant_users
 * or user_roles), or are shared with the whole organisation
 * (connection_visibility 'org', which every member already sees in Chat).
 * Only client threads of these lines are read (get_client_thread_activity).
 * The tenant's own Carmen line (its active Manus integrations) is read too,
 * for groups only (AIO-515): a tenant whose groups run on Carmen's line, such
 * as DMM, would otherwise have nothing to review. Meta business numbers are
 * not read. Nothing is ever sent through these lines.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { CARMEN_PROVIDER, MONITORED_PROVIDER } from "./activity.ts";

export type MonitoredLines = {
  /** chat_messages.connection_user_id of each monitored line. */
  ids: string[];
  /** chat_messages.connection_user_id of the tenant's Carmen (Manus) lines, read for groups only. */
  carmenIds: Array<string>;
  /** Active Green lines left unread: no user, or a private line of someone who is not a member. */
  skipped: number;
};

/** The monitored lines, and how many active Green lines are not read. */
export async function monitoredLines(
  db: DbClient,
  tenantId: string,
): Promise<MonitoredLines> {
  const [lines, carmen, roles, members] = await Promise.all([
    db
      .from("tenant_integrations")
      .select("user_id, connection_visibility")
      .eq("tenant_id", tenantId)
      .eq("integration_type", MONITORED_PROVIDER)
      .eq("is_active", true),
    db
      .from("tenant_integrations")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("integration_type", CARMEN_PROVIDER)
      .eq("is_active", true),
    db.from("user_roles").select("user_id").eq("tenant_id", tenantId),
    db.from("tenant_users").select("user_id").eq("tenant_id", tenantId),
  ]);
  throwIf(lines.error, "tenant_integrations");
  throwIf(carmen.error, "tenant_integrations");
  throwIf(roles.error, "user_roles");
  throwIf(members.error, "tenant_users");
  const team = [...(roles.data ?? []), ...(members.data ?? [])];
  const memberIds = new Set(team.map((row) => row.user_id));
  const all = lines.data ?? [];
  const ids = all.flatMap((line) =>
    line.user_id &&
    (memberIds.has(line.user_id) || line.connection_visibility === "org")
      ? [line.user_id]
      : [],
  );
  // Carmen's Manus rows carry the line owner's id as connection_user_id.
  const carmenIds = (carmen.data ?? []).flatMap((line) =>
    line.user_id ? [line.user_id] : [],
  );
  return {
    ids: [...new Set(ids)],
    carmenIds: [...new Set(carmenIds)],
    skipped: all.length - ids.length,
  };
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
