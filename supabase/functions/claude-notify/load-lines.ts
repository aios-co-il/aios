/** The WhatsApp lines claude-notify may send from, as tenant_integrations rows. */

import { tenantCanUseIntegration } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
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

/**
 * Lines a step or trigger names that are not the tenant's own: only those
 * shared with the tenant (tenant_can_use_integration, the rule the senders
 * apply) are read. Any other id is dropped, so a step naming it resolves as
 * not_found and the next step or the tenant's own primary line is used.
 */
export async function loadLinesById(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  ids: string[],
): Promise<NotifyIntegrationRow[]> {
  const shared = await sharedLineIds(sb, tenantId, ids);
  if (!shared.length) {
    return [];
  }
  const { data, error } = await sb
    .from("tenant_integrations")
    .select(INTEGRATION_COLS)
    .in("id", shared);
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
