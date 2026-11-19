// Saving a tenant-level Google connection (Analytics, Search Console, Ads) in
// tenant_integrations. Each caller picks which existing row a reconnect
// replaces; the update or insert and the settings merge are shared.
import { z } from "npm:zod@3.25.76";
import type { Json } from "../database.types.ts";
import { serviceClient } from "../supabase-clients.ts";
import type { GoogleTokens } from "./exchange-code.ts";

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema.optional()),
  ]),
);

/** settings is free-form jsonb shared by several features, so every key is kept. */
const storedSettingsSchema = z.record(jsonSchema.optional()).nullable();

export type StoredSettings = { [key: string]: Json | undefined };

export type StoredConnection = {
  id: string;
  user_id: string | null;
  settings: StoredSettings;
};

/** The tenant's rows of this Google integration type. */
export async function tenantConnections(
  tenantId: string,
  integrationType: string,
): Promise<Array<StoredConnection>> {
  const { data, error } = await serviceClient()
    .from("tenant_integrations")
    .select("id, user_id, settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", integrationType);
  if (error) {
    throw new Error(`tenant_integrations lookup failed: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    settings: storedSettingsSchema.parse(row.settings) ?? {},
  }));
}

export type SaveConnection = {
  tenantId: string;
  userId: string;
  integrationType: string;
  existing: StoredConnection | undefined;
  tokens: GoogleTokens;
  googleEmail?: string;
  visibility?: "org";
};

/** Updates the existing row with fresh tokens, or inserts one for the user. */
export async function saveTenantConnection(
  connection: SaveConnection,
): Promise<void> {
  const { tenantId, userId, integrationType, existing, tokens } = connection;
  const now = new Date().toISOString();
  const values = {
    is_active: true,
    api_key: tokens.access_token,
    settings: connectedSettings(connection),
    updated_at: now,
    ...(connection.visibility
      ? { connection_visibility: connection.visibility }
      : {}),
  };

  const { error } = existing
    ? await serviceClient()
        .from("tenant_integrations")
        .update(values)
        .eq("id", existing.id)
        .eq("tenant_id", tenantId)
    : await serviceClient()
        .from("tenant_integrations")
        .insert({
          ...values,
          tenant_id: tenantId,
          user_id: userId,
          integration_type: integrationType,
        });
  if (error) {
    throw new Error(`tenant_integrations save failed: ${error.message}`);
  }
}

/** The stored settings with fresh token details and any reconnect flag cleared. */
function connectedSettings({
  existing,
  tokens,
  googleEmail,
}: SaveConnection): StoredSettings {
  const stored = existing?.settings ?? {};

  return {
    ...stored,
    refresh_token: tokens.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    connected_at: new Date().toISOString(),
    ...(googleEmail === undefined
      ? {}
      : { google_email: googleEmail || stored.google_email || "" }),
    needs_reauth: false,
    reauth_reason: null,
    reauth_marked_at: null,
  };
}
