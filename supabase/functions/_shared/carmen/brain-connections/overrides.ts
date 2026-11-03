import type { DbClient } from "../../supabase-clients.ts";

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

/** A trimmed string field of a jsonb object, or "". */
export function settingString(settings: unknown, key: string): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    return "";
  const value = (settings as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}
