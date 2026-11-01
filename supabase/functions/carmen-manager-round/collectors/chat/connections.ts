/**
 * The WhatsApp lines whose client threads the chat collector reads: the
 * tenant's active Green API lines that belong to a member of the tenant
 * (owners, agency owners, campaigners and other staff, through tenant_users
 * or user_roles), or are shared with the whole organisation
 * (connection_visibility 'org', which every member already sees in Chat).
 * Only client threads of these lines are read (get_client_thread_activity).
 * Carmen's Manus line and Meta business numbers store rows under their own
 * provider and are not read until David decides to monitor them (AIO-252
 * phase 2). Nothing is ever sent through these lines.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import { MONITORED_PROVIDER } from "./activity.ts";

export type MonitoredLines = {
  /** chat_messages.connection_user_id of each monitored line. */
  ids: string[];
  /** Active Green lines left unread: no user, or a private line of someone who is not a member. */
  skipped: number;
};

/** The monitored lines, and how many active Green lines are not read. */
export async function monitoredLines(
  db: DbClient,
  tenantId: string,
): Promise<MonitoredLines> {
  const [lines, roles, members] = await Promise.all([
    db
      .from("tenant_integrations")
      .select("user_id, connection_visibility")
      .eq("tenant_id", tenantId)
      .eq("integration_type", MONITORED_PROVIDER)
      .eq("is_active", true),
    db.from("user_roles").select("user_id").eq("tenant_id", tenantId),
    db.from("tenant_users").select("user_id").eq("tenant_id", tenantId),
  ]);
  throwIf(lines.error, "tenant_integrations");
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
