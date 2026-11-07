import { z } from "npm:zod@3.25.76";
import type { DbClient } from "../_shared/supabase-clients.ts";

export interface GreenApiIntegration {
  apiToken: string;
  instanceId: string;
  countryCode: string;
}

const settingValue = z
  .union([z.string(), z.number()])
  .optional()
  .catch(undefined);

const greenApiSettingsSchema = z
  .object({
    instance_id: settingValue,
    country_code: settingValue,
    default_country_code: settingValue,
  })
  .catch({});

/** The Green API credentials of an integration, or null when it isn't set up. */
export async function loadGreenApiIntegration(
  db: Pick<DbClient, "from">,
  integrationId: string | null,
): Promise<GreenApiIntegration | null> {
  if (!integrationId) {
    return null;
  }

  const { data, error } = await db
    .from("tenant_integrations")
    .select("api_key, settings")
    .eq("id", integrationId)
    .maybeSingle();
  if (error) {
    console.error("[broadcast-dispatch] integration read failed", {
      integrationId,
      error: error.message,
    });
    return null;
  }

  return greenApiIntegrationFrom(data);
}

/** Reads the credentials from a `tenant_integrations` row. */
export function greenApiIntegrationFrom(
  row: { api_key: string | null; settings: unknown } | null,
): GreenApiIntegration | null {
  const settings = greenApiSettingsSchema.parse(row?.settings);
  if (!row?.api_key || !settings.instance_id) {
    return null;
  }

  return {
    apiToken: row.api_key,
    instanceId: String(settings.instance_id),
    countryCode: String(
      settings.country_code || settings.default_country_code || "972",
    ),
  };
}
