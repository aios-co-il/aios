import type { DbClient } from "../_shared/supabase-clients.ts";

/** Integration types that are WhatsApp lines, as tenant_integrations stores them. */
export const WHATSAPP_LINE_TYPES = ["manus_wa", "green_api", "meta_whatsapp"];

// The gateway behind send_whatsapp_via_gateway (manage-manus-wa) sends through manus_wa lines.
export const GATEWAY_LINE_TYPE = "manus_wa";

/**
 * The integration types a list_integrations filter means. "whatsapp" (any case, Hebrew too)
 * is the family of WhatsApp lines, which no single stored type is called; any other value
 * is an exact type. Before this the brain asked for "whatsapp", matched nothing, and told
 * the user the org had no WhatsApp line.
 */
export function integrationTypesFor(type: string): Array<string> {
  const wanted = type.trim().toLowerCase();
  if (["whatsapp", "wa", "וואטסאפ", "ווטסאפ"].includes(wanted)) {
    return WHATSAPP_LINE_TYPES;
  }
  return [type.trim()];
}

/** The tenant's oldest active manus_wa line, which the gateway sends through; null when it has none. */
export async function defaultGatewayLine(
  db: Pick<DbClient, "from">,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("integration_type", GATEWAY_LINE_TYPE)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[AGENT] default WhatsApp line read failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}
