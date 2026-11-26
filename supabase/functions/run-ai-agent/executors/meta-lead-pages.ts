import { fetchMetaDiscovery } from "./meta-discovery-request.ts";
import type { MetaLeadPage } from "./meta-lead-types.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { metaLeadIntegrations } from "../meta-lead-integrations.ts";
import { configuredPages } from "../meta-lead-settings.ts";
import type { MetaNode } from "../meta-response.ts";
import { FB_GRAPH_VERSION } from "../executors/meta-api-version.ts";
import { readMetaResponse } from "../meta-response.ts";

export async function metaLeadPages(
  supabase: DbClient,
  tenantId: string,
): Promise<Array<MetaLeadPage>> {
  const integrations = await metaLeadIntegrations(supabase, tenantId);
  const pages: Array<MetaLeadPage> = [];
  for (const integration of integrations) {
    let sourcePages: Array<MetaNode> = configuredPages(integration.settings);
    if (sourcePages.length === 0) {
      let next: string | null =
        `https://graph.facebook.com/${FB_GRAPH_VERSION}/me/accounts?fields=id,name,access_token&limit=100`;
      while (next) {
        const response = await fetchMetaDiscovery(next, integration.api_key);
        const result = await readMetaResponse(response);
        if (!result.ok) {
          throw new Error(
            String(result.error.message ?? "Meta pages request failed"),
          );
        }
        const json = result.value;
        if (!response.ok || json?.error) {
          throw new Error(json?.error?.message || "Meta pages request failed");
        }
        sourcePages = sourcePages.concat(json.data || []);
        next = json.paging?.next || null;
      }
    }
    for (const page of sourcePages) {
      if (page?.id && page?.access_token) {
        pages.push({
          id: String(page.id),
          name: String(page.name || page.id),
          access_token: String(page.access_token),
          integration_id: integration.id,
        });
      }
    }
  }
  return pages;
}
