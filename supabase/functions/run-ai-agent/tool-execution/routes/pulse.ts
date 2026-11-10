import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetLatestCampaignPulse } from "../../executors/get-latest-campaign-pulse.ts";
import { legacyRefreshCampaignPulseRoute } from "../legacy-refresh-campaign-pulse.ts";
import { REFRESH_PULSE_TOOL_NAME } from "../../../_shared/carmen/pulse-tools.ts";
import { executeAnalyzeCampaignPerformance } from "../../executors/analyze-campaign-performance.ts";
import { executeUpdateClientHealth } from "../../executors/update-client-health.ts";
import { executeGetClientRetentionScan } from "../../executors/get-client-retention-scan.ts";
import { executeBatchUpdateClientHealth } from "../../executors/batch-update-client-health.ts";

/** pulse tool routes; argument assertions retain the legacy tool boundary. */
export const pulseRoutes: Record<string, ToolRoute> = {
  get_latest_campaign_pulse: bindToolRoute(executeGetLatestCampaignPulse),
  [REFRESH_PULSE_TOOL_NAME]: legacyRefreshCampaignPulseRoute,
  analyze_campaign_performance: bindToolRoute(
    executeAnalyzeCampaignPerformance,
  ),
  update_client_health: bindToolRoute(executeUpdateClientHealth),
  get_client_retention_scan: bindToolRoute(executeGetClientRetentionScan),
  batch_update_client_health: bindToolRoute(executeBatchUpdateClientHealth),
};
