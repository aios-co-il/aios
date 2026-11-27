import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetCampaignAlerts } from "../../executors/get-campaign-alerts.ts";
import { executeAcknowledgeCampaignAlert } from "../../executors/acknowledge-campaign-alert.ts";
import { executeResolveCampaignAlert } from "../../executors/resolve-campaign-alert.ts";

export const campaignAlertRoutes: Record<string, ToolRoute> = {
  get_campaign_alerts: bindToolRoute(executeGetCampaignAlerts),
  acknowledge_campaign_alert: bindToolRoute(executeAcknowledgeCampaignAlert),
  resolve_campaign_alert: bindToolRoute(executeResolveCampaignAlert),
};
