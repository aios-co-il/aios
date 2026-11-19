/**
 * Google OAuth tokens of tenant_integrations rows, read from the server-only
 * integration_secrets table (AIO-608). The row's own api_key and
 * settings.refresh_token stay the fallback until the tokens are moved off it.
 */
import { z } from "npm:zod@3.25.76";
import type { DbClient } from "../supabase-clients.ts";

/** The columns of a tenant_integrations row the tokens live in. */
export type TokenRow = {
  id: string;
  api_key?: string | null;
  settings?: unknown;
};

type Secret = {
  access_token: string | null;
  refresh_token: string | null;
};

const settingsSchema = z.record(z.unknown());

/**
 * Copies of `rows` whose api_key and settings.refresh_token come from
 * integration_secrets when it has them. `sb` must be a service-role client.
 */
export async function withGoogleTokens<T extends TokenRow>(
  sb: Pick<DbClient, "from">,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) {
    return rows;
  }
  const { data, error } = await sb
    .from("integration_secrets")
    .select("integration_id, access_token, refresh_token")
    .in(
      "integration_id",
      rows.map((row) => row.id),
    );
  if (error) {
    throw new Error(
      `withGoogleTokens: reading integration_secrets failed: ${error.message}`,
    );
  }
  const secrets = new Map(data.map((s) => [s.integration_id, s]));

  return rows.map((row) => {
    const secret = secrets.get(row.id);
    return secret ? withSecret(row, secret) : row;
  });
}

/** withGoogleTokens for one row, or null when there is none. */
export async function withGoogleToken<T extends TokenRow>(
  sb: Pick<DbClient, "from">,
  row: T | null,
): Promise<T | null> {
  if (!row) {
    return null;
  }
  const [merged] = await withGoogleTokens(sb, [row]);
  return merged ?? null;
}

/** A copy of `row` with the secret's tokens over its own; a null secret token keeps the row's. */
function withSecret<T extends TokenRow>(row: T, secret: Secret): T {
  const parsed = settingsSchema.safeParse(row.settings);
  const settings = parsed.success ? parsed.data : {};
  const refreshToken = secret.refresh_token ?? settings.refresh_token;

  return {
    ...row,
    api_key: secret.access_token ?? row.api_key,
    settings:
      refreshToken === undefined
        ? row.settings
        : { ...settings, refresh_token: refreshToken },
  };
}
