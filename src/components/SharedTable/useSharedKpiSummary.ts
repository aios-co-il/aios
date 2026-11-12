import { useMemo } from "react";
import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import { isEcommerceReportTable } from "@/lib/pulseCampaignGoals";
import type { SharedTableInfo, SharedTableRecord } from "./publicTableApi";
import { sharedIntegrationReport } from "./sharedIntegrationReport";
import { useSharedTableGoals } from "./useSharedTableGoals";

/**
 * The share link's KPI figures, each campaign counted toward its own goal like
 * the internal report. `leadsOnly` when the report has no sales campaigns.
 */
export function useSharedKpiSummary(
  table: SharedTableInfo,
  allRecords: Array<SharedTableRecord>,
  levelRecords: Array<SharedTableRecord>,
  level: AdsEntityLevel,
) {
  const integrationType = table.integration_type || "";
  const isGoogleAds = integrationType === "google_ads";
  // The table's own mode, by the rule the internal report uses
  // (isEcommerceReportTable reads the "איקומרס" category too, AIO-494). A
  // Facebook Insights table splits per campaign, so its mode stays leads.
  const tableMode: "leads" | "ecommerce" =
    integrationType !== "facebook_insights" && isEcommerceReportTable(table)
      ? "ecommerce"
      : "leads";
  const tableGoals = useSharedTableGoals(
    allRecords,
    isGoogleAds ? table : null,
    tableMode,
  );
  const report = useMemo(
    () =>
      sharedIntegrationReport(levelRecords, {
        integrationType,
        level,
        integrationSettings: table.integration_settings,
        tableGoals,
        tableMode,
      }),
    [
      levelRecords,
      integrationType,
      level,
      table.integration_settings,
      tableGoals,
      tableMode,
    ],
  );
  return { summary: report.summary, leadsOnly: !report.goals.hasEcommerce };
}
