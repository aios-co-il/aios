// The Green API line a webhook call belongs to. green-api-webhook handles a
// call for this line, and configure-green-api gives this same line its webhook
// token, so the token is checked against the row it was stored for.
import type { DbClient } from "../supabase-clients.ts";
import type { Json } from "../database.types.ts";

export type WebhookLine = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  settings: Json | null;
  instance_id: string | null;
  api_key: string | null;
};

export type WebhookLineLookup =
  { line: WebhookLine | null; error: null } | { line: null; error: string };

/**
 * The newest active green_api row with this instance id; duplicates across
 * reconnects resolve to the most recent one.
 */
export async function findWebhookLine(
  db: Pick<DbClient, "from">,
  instanceId: string | number,
): Promise<WebhookLineLookup> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("id, tenant_id, user_id, settings, instance_id, api_key")
    .eq("integration_type", "green_api")
    .eq("is_active", true)
    .eq("instance_id", String(instanceId))
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return { line: null, error: error.message };
  }
  return { line: data?.[0] ?? null, error: null };
}
