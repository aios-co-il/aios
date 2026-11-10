/**
 * The report tables Carmen's campaign tools judge campaigns by. The reports
 * decide a campaign's goal from its table's type and settings, so the tools
 * read the same columns.
 */
import type { CampaignGoalTable } from "../_shared/campaign-goal/campaign-goals.ts";
import type { AgentDatabaseClient } from "./database-contracts.ts";
import { readReportSettings } from "./report-settings.ts";

/** A report table with whether its campaigns are switched on (`campaign_active`). */
export type ReportGoalTable = CampaignGoalTable & { campaign_active?: boolean };

/**
 * Each table's goal inputs by id. The ids come from a tenant-scoped lookup, so
 * the read filters by id only. Throws on a read error.
 */
export async function readCampaignGoalTables(
  supabase: AgentDatabaseClient,
  tableIds: ReadonlyArray<string>,
): Promise<Map<string, ReportGoalTable>> {
  const tables = new Map<string, ReportGoalTable>();
  if (tableIds.length === 0) {
    return tables;
  }
  const { data, error } = await supabase
    .from("crm_tables")
    .select(
      "id, integration_type, integration_settings, category, campaign_active",
    )
    .in("id", tableIds);
  if (error) {
    throw error;
  }
  for (const table of data ?? []) {
    tables.set(table.id, {
      ...table,
      integration_settings: readReportSettings(table.integration_settings),
    });
  }
  return tables;
}
