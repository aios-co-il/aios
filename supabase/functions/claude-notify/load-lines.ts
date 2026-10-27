/** The WhatsApp lines claude-notify may send from, as tenant_integrations rows. */

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

/** Lines a step or trigger names by id. */
export async function loadLinesById(
  sb: Pick<DbClient, "from">,
  ids: string[],
): Promise<NotifyIntegrationRow[]> {
  if (!ids.length) {
    return [];
  }
  // No tenant filter: a step may name a line shared from another tenant, and
  // that line must still resolve.
  const { data, error } = await sb
    .from("tenant_integrations")
    .select(INTEGRATION_COLS)
    .in("id", ids);
  if (error) {
    throw new Error(`claude-notify: load named lines failed: ${error.message}`);
  }
  return data ?? [];
}
