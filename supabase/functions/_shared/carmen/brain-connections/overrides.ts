import type { DbClient } from "../../supabase-clients.ts";
import { BUILTIN_BRAIN_KEYS } from "./presets.ts";

/** The parts of the client the key lookups use; tests pass a fake. */
export type SecretClient = Pick<DbClient, "from" | "rpc">;

/** Decrypted Vault key of one connection; "" when it has none. */
export async function connectionSecret(
  sb: SecretClient,
  connectionId: string,
): Promise<string> {
  const { data, error } = await sb.rpc("carmen_brain_secret_get", {
    p_connection_id: connectionId,
  });
  if (error) throw new Error(`Brain key read failed: ${error.message}`);
  return typeof data === "string" ? data : "";
}

/**
 * Env names → values a tenant set from Carmen settings for built-in brains:
 * the Vault key under the brain's secret env name, and its id (routine,
 * trigger or webhook URL) under the id env name.
 */
export async function tenantBrainOverrides(
  sb: SecretClient,
  tenantId: string,
): Promise<Record<string, string>> {
  const { data, error } = await sb
    .from("carmen_brain_connections")
    .select("id, slug, settings, secret_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "builtin");
  if (error) throw new Error(`Brain keys read failed: ${error.message}`);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const spec = BUILTIN_BRAIN_KEYS.find((b) => b.slug === row.slug);
    if (!spec) continue;
    if (row.secret_id) {
      const secret = await connectionSecret(sb, row.id);
      if (secret) out[spec.secretEnv] = secret;
    }
    const externalId = settingString(row.settings, "external_id");
    if (spec.idEnv && externalId) out[spec.idEnv] = externalId;
  }
  return out;
}

/** A trimmed string field of a jsonb object, or "". */
export function settingString(settings: unknown, key: string): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    return "";
  const value = (settings as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}
