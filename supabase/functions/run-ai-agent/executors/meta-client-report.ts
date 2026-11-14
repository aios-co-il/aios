import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { CampaignGoalTable } from "../../_shared/campaign-goal/campaign-goals.ts";
import { errorMessage } from "../error-message.ts";
import { readReportSettings } from "../report-settings.ts";

/**
 * The client's ad account (without act_) and the Meta report table it comes
 * from, whose settings decide its campaigns' goals. An account set only on the
 * client record gets a table with no settings, judged like a mixed report.
 */
export async function fbResolveClientMetaReport(
  supabase: AgentDatabaseClient,
  _tenantId: string,
  clientId: string,
): Promise<{ account: string; table: CampaignGoalTable } | null> {
  // client_id is globally unique — do not require tenant_id match. Shared/partner
  // tenants often hold the CRM row while Carmen runs under David's home tenant.
  const { data, error } = await supabase
    .from("crm_tables")
    .select(
      "id, integration_type, integration_settings, category, last_sync_at",
    )
    .eq("client_id", clientId)
    .in("integration_type", ["facebook_insights", "facebook_ecommerce"])
    .order("last_sync_at", { ascending: false, nullsFirst: false });
  if (error) {
    // Logged, not thrown: the client-record fallback below still answers.
    console.warn(
      `[fbResolveClientMetaReport] ${clientId}: ${errorMessage(error)}`,
    );
  }
  for (const t of data || []) {
    const s = readReportSettings(t.integration_settings);
    const acc = s.ad_account_id || s.account_id || s.meta_account_id;
    if (acc) {
      return {
        account: String(acc).replace(/^act_/, ""),
        table: {
          id: t.id,
          integration_type: t.integration_type,
          integration_settings: s,
          category: t.category,
        },
      };
    }
  }
  // 2. Fallback: clients.meta_ads_account_id (the ad account set directly on the client record).
  const { data: cl } = await supabase
    .from("clients")
    .select("meta_ads_account_id")
    .eq("id", clientId)
    .maybeSingle();
  if (cl?.meta_ads_account_id) {
    return {
      account: String(cl.meta_ads_account_id).replace(/^act_/, ""),
      table: {
        id: `client:${clientId}`,
        integration_type: "facebook_insights",
      },
    };
  }
  return null;
}
