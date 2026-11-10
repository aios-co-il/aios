import type { AgentDatabaseClient, AgentRow } from "./database-contracts.ts";
import {
  readMetaLeadSettings,
  type MetaLeadSettings,
} from "./meta-lead-settings.ts";

/** One invalid integration must not prevent the tenant's other integrations from loading. */
export async function metaLeadIntegrations(
  supabase: AgentDatabaseClient,
  tenantId: string,
): Promise<Array<MetaLeadIntegration>> {
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("id, api_key, settings, shared_from_integration_id")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "facebook_lead_ads")
    .eq("is_active", true);
  if (error) {
    throw error;
  }
  const integrations: Array<MetaLeadIntegration> = [];
  for (const row of data ?? []) {
    const settings = readIntegrationSettings(row.settings, row.id);
    if (!settings) {
      continue;
    }
    let source = { api_key: row.api_key, settings };
    if ((!row.api_key || !settings.pages) && row.shared_from_integration_id) {
      const { data: shared, error: sharedError } = await supabase
        .from("tenant_integrations")
        .select("id, api_key, settings")
        .eq("id", row.shared_from_integration_id)
        .maybeSingle();
      if (sharedError) {
        throw sharedError;
      }
      if (shared) {
        const sharedSettings = readIntegrationSettings(
          shared.settings,
          shared.id,
        );
        if (!sharedSettings) {
          continue;
        }
        source = { api_key: shared.api_key, settings: sharedSettings };
      }
    }
    if (source.api_key) {
      integrations.push({
        id: row.id,
        api_key: source.api_key,
        settings: source.settings,
      });
    }
  }
  return integrations;
}

export type MetaLeadIntegration = Pick<
  AgentRow<"tenant_integrations">,
  "id"
> & {
  api_key: string;
  settings: MetaLeadSettings;
};

/** The reader logs field paths; identify the rejected row without logging stored values. */
function readIntegrationSettings(
  value: unknown,
  integrationId: string,
): MetaLeadSettings | undefined {
  try {
    return readMetaLeadSettings(value);
  } catch {
    console.warn("[Meta lead integrations] Skipping invalid settings", {
      integrationId,
    });
    return undefined;
  }
}
