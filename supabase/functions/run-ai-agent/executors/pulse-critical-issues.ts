import type { AgentDatabaseClient } from "../database-contracts.ts";
import { CAMPAIGN_TABLE_TYPES } from "../../_shared/campaign-pulse.ts";
import { selectPulseCriticalAlerts } from "../../_shared/campaign-pulse.ts";
import { clientAdAccountIds } from "../../_shared/campaign-pulse.ts";
import { readReportSettings } from "../report-settings.ts";

/**
 * Open critical campaign alerts (stopped campaigns, disapproved ads) for the
 * clients in a pulse snapshot, limited to clients with an active campaign table.
 */
export async function loadPulseCriticalIssues(
  supabase: AgentDatabaseClient,
  accessibleTenantIds: Array<string>,
  rows: Array<{ client_id: string; client_name?: string | null }>,
) {
  const clientIds = rows.map((row) => row.client_id).filter(Boolean);
  if (!clientIds.length) {
    return [];
  }
  try {
    const [tables, alerts] = await Promise.all([
      supabase
        .from("crm_tables")
        .select(
          "client_id, integration_settings, campaign_active, integration_type",
        )
        .in("client_id", clientIds)
        .in("integration_type", [...CAMPAIGN_TABLE_TYPES]),
      supabase
        .from("campaign_alerts")
        .select(
          "client_id, ad_account_id, campaign_id, campaign_name, alert_type, severity",
        )
        .in("tenant_id", accessibleTenantIds)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (tables.error || alerts.error) {
      return [];
    }

    const activeTablesByClient = new Map<
      string | null,
      NonNullable<typeof tables.data>
    >();
    for (const table of tables.data || []) {
      if (table.campaign_active === false) {
        continue;
      }
      activeTablesByClient.set(table.client_id, [
        ...(activeTablesByClient.get(table.client_id) || []),
        table,
      ]);
    }
    return selectPulseCriticalAlerts(
      alerts.data || [],
      rows.map((row) => {
        const activeTables = activeTablesByClient.get(row.client_id) || [];
        return {
          clientId: row.client_id,
          clientName: row.client_name || null,
          adAccountIds: clientAdAccountIds(
            activeTables.map((table) => ({
              ...table,
              integration_settings: readReportSettings(
                table.integration_settings,
              ),
            })),
          ),
          hasActiveCampaignTable: activeTables.length > 0,
        };
      }),
    );
  } catch (error) {
    console.warn(
      "[pulse] critical alert lookup failed",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}
