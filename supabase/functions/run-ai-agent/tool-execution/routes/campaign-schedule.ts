import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeScheduleCampaignToggle } from "../../executors/schedule-campaign-toggle.ts";
import { executeListCampaignSchedules } from "../../executors/list-campaign-schedules.ts";
import { executeCancelCampaignSchedule } from "../../executors/cancel-campaign-schedule.ts";

/** campaign-schedule tool routes; argument assertions retain the legacy tool boundary. */
export const campaignScheduleRoutes: Record<string, ToolRoute> = {
  schedule_campaign_toggle: bindToolRoute(executeScheduleCampaignToggle),
  list_campaign_schedules: bindToolRoute(executeListCampaignSchedules),
  cancel_campaign_schedule: bindToolRoute(executeCancelCampaignSchedule),
};
