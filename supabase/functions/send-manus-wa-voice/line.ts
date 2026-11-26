/**
 * The Manus line a voice note leaves from: exactly the line that received the
 * message (AIO-654), read with the service role and scoped by tenant.
 */
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import type { VoiceLine } from "./handler.ts";

/** A tenant_integrations row as far as the voice note needs it. */
type LineRow = {
  id: string;
  tenant_id: string;
  api_key: string | null;
  settings: unknown;
};

/**
 * The tenant's active Manus line with this id, or null when there is none or
 * it lacks a key or an instance. Never another line. Throws when the read
 * fails.
 */
export async function loadVoiceLine(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  integrationId: string,
): Promise<VoiceLine | null> {
  if (!asUuidOrNull(tenantId) || !asUuidOrNull(integrationId)) {
    return null;
  }
  const { data, error } = await sb
    .from("tenant_integrations")
    .select("id, tenant_id, api_key, settings")
    .eq("id", integrationId)
    .eq("tenant_id", tenantId)
    .eq("integration_type", "manus_wa")
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`tenant_integrations read failed: ${error.message}`);
  }

  return gatewayLine(data);
}

/** The line's gateway fields, or null when its key or instance is missing. */
function gatewayLine(row: LineRow | null): VoiceLine | null {
  const settings = isRecord(row?.settings) ? row.settings : {};
  const instanceId = settings.instance_id;
  if (!row?.api_key || typeof instanceId !== "string" || !instanceId) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    apiKey: row.api_key,
    instanceId,
    gatewayUrl:
      typeof settings.gateway_url === "string" ? settings.gateway_url : null,
  };
}

/** True for a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
