/** The WhatsApp lines claude-notify may send from, as tenant_integrations rows. */

import { tenantCanUseIntegration } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import { MANUS_WA_TYPES } from "../_shared/whatsapp/send-result.ts";
import { GREEN_INTEGRATION_TYPES, type NotifyIntegrationRow } from "./lines.ts";

// settings carries carmen_role: only primary lines may send notifications.
const INTEGRATION_COLS =
  "id, tenant_id, user_id, integration_type, is_active, created_at, settings";

/** The tenant's own Manus and Green lines. */
export async function loadTenantLines(
  sb: Pick<DbClient, "from">,
  tenantId: string,
): Promise<NotifyIntegrationRow[]> {
  const { data, error } = await sb
    .from("tenant_integrations")
    .select(INTEGRATION_COLS)
    .eq("tenant_id", tenantId)
    .in("integration_type", [...MANUS_WA_TYPES, ...GREEN_INTEGRATION_TYPES]);
  if (error) {
    throw new Error(
      `claude-notify: load tenant lines failed: ${error.message}`,
    );
  }
  return data ?? [];
}

/** Lines a step or trigger names that are not the tenant's own, and which of them are shared with the tenant. */
export type NamedLines = { rows: NotifyIntegrationRow[]; sharedIds: string[] };

/**
 * Lines a step or trigger names that are not the tenant's own, and which of
 * them are shared with the tenant (tenant_can_use_integration). The ids come
 * from the tenant's own steps, and a row read here is only a candidate: the
 * transport sends from another tenant's line only when it is shared or the
 * planned sender is a super admin, the rule the senders apply (mayUseLine,
 * _shared/auth/tenant-access.ts). An id that is not a uuid names no line and
 * is never queried.
 */
export async function loadNamedLines(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  ids: string[],
): Promise<NamedLines> {
  const uuids = ids.filter((id) => asUuidOrNull(id) === id);
  if (!uuids.length) {
    return { rows: [], sharedIds: [] };
  }
  const [rows, sharedIds] = await Promise.all([
    readLines(sb, uuids),
    sharedLineIds(sb, tenantId, uuids),
  ]);
  return { rows, sharedIds };
}

/** The tenant_integrations rows with these ids. */
async function readLines(
  sb: Pick<DbClient, "from">,
  ids: string[],
): Promise<NotifyIntegrationRow[]> {
  const { data, error } = await sb
    .from("tenant_integrations")
    .select(INTEGRATION_COLS)
    .in("id", ids);
  if (error) {
    throw new Error(`claude-notify: load named lines failed: ${error.message}`);
  }
  return data ?? [];
}

/** The ids the tenant may use, in the order given. */
async function sharedLineIds(
  sb: Pick<DbClient, "rpc">,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  const usable = await Promise.all(
    ids.map((id) => tenantCanUseIntegration(sb, tenantId, id)),
  );
  return ids.filter((_, i) => usable[i]);
}
