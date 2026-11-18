import { z } from "npm:zod@3.25.76";

// settings is free-form jsonb shared by several features, so keep every key.
const storedSettingsSchema = z.record(z.unknown()).nullable();

/**
 * Settings to save when a Facebook connection is (re)connected: the fresh pages
 * and token expiry, keeping everything else the user configured, such as
 * `form_mappings` that route each lead form.
 */
export function reconnectSettings(
  storedSettings: unknown,
  pages: unknown[],
  tokenExpiresAt: string,
): Record<string, unknown> {
  const stored = storedSettingsSchema.parse(storedSettings) ?? {};

  return { ...stored, pages, token_expires_at: tokenExpiresAt };
}
