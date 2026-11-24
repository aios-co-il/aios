// Saving a tenant-level Google connection (Analytics, Search Console, Ads) in
// tenant_integrations. Each caller picks which existing row a reconnect
// replaces; the update or insert and the settings merge are shared.
import { z } from "npm:zod@3.25.76";
import type { Json } from "../database.types.ts";
import { serviceClient } from "../supabase-clients.ts";
import type { GoogleTokens } from "./exchange-code.ts";
import { UserFacingError } from "./user-facing-error.ts";

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

/** A JSON string, decoded; fails on any other value or on text that is not JSON. */
const encodedJsonSchema = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not JSON" });
    return z.NEVER;
  }
});

/** settings is free-form jsonb shared by several features, so every key is kept. */
const storedSettingsSchema = z.record(jsonSchema.optional()).nullable();

export type StoredSettings = { [key: string]: Json | undefined };

export type StoredConnection = {
  id: string;
  user_id: string | null;
  /** null when the stored value is not an object: the row is never rewritten from it. */
  settings: StoredSettings | null;
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
    settings: storedSettings(row.id, row.settings),
    updated_at: row.updated_at,
  }));
}

/**
 * The row's settings object; a double-encoded object (a JSON string) is
 * decoded. Any other value is logged and returned as null, so this row is not
 * reused, and other rows of the tenant still connect.
 */
function storedSettings(rowId: string, value: Json): StoredSettings | null {
  const settings = storedSettingsSchema.safeParse(
    encodedJsonSchema.safeParse(value).data ?? value,
  );
  if (!settings.success) {
    console.error(`tenant_integrations ${rowId}: settings is not an object`);
    return null;
  }

  return settings.data ?? {};
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
  if (existing && existing.settings === null) {
    throw new UserFacingError(
      "This connection's saved settings cannot be read, so it was not changed. Contact support.",
    );
  }

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
  // A PATCH that matched nothing returns no rows (an empty body reads as null).
  if (!data || data.length === 0) {
    throw new UserFacingError(
      "The connection changed while connecting, so it was not saved. Connect again.",
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
