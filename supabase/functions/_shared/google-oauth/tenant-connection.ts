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
  /** The version the settings were read at; the update applies only if it is unchanged. */
  updated_at: string;
};

/** The tenant's rows of this Google integration type. */
export async function tenantConnections(
  tenantId: string,
  integrationType: string,
): Promise<Array<StoredConnection>> {
  const { data, error } = await serviceClient()
    .from("tenant_integrations")
    .select("id, user_id, settings, updated_at")
    .eq("tenant_id", tenantId)
    .eq("integration_type", integrationType);
  if (error) {
    throw new Error(`tenant_integrations lookup failed: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    settings: storedSettingsSchema.parse(row.settings) ?? {},
    updated_at: row.updated_at,
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

/**
 * Updates the existing row with fresh tokens, or inserts one for the user.
 * The settings merge is read-modify-write, so the update applies only when the
 * row is still at the version it was read at; a concurrent change makes the
 * connect fail (the user connects again) instead of overwriting it.
 */
export async function saveTenantConnection(
  connection: SaveConnection,
): Promise<void> {
  const { tenantId, userId, integrationType, existing, tokens } = connection;
  const values = {
    is_active: true,
    api_key: tokens.access_token,
    settings: connectedSettings(connection),
    updated_at: new Date().toISOString(),
    ...(connection.visibility
      ? { connection_visibility: connection.visibility }
      : {}),
  };

  if (!existing) {
    const { error } = await serviceClient()
      .from("tenant_integrations")
      .insert({
        ...values,
        tenant_id: tenantId,
        user_id: userId,
        integration_type: integrationType,
      });
    if (error) {
      throw new Error(`tenant_integrations insert failed: ${error.message}`);
    }
    return;
  }

  const { data, error } = await serviceClient()
    .from("tenant_integrations")
    .update(values)
    .eq("id", existing.id)
    .eq("tenant_id", tenantId)
    .eq("updated_at", existing.updated_at)
    .select("id");
  if (error) {
    throw new Error(`tenant_integrations update failed: ${error.message}`);
  }
  if (data.length === 0) {
    throw new Error(
      "tenant_integrations changed while connecting; the connect was not saved",
    );
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
