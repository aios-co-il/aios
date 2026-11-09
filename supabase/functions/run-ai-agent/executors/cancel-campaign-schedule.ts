import type { CancelCampaignScheduleArgs } from "./campaign-schedule-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing cancel_campaign_schedule executor and side-effect order. */
export async function executeCancelCampaignSchedule(
  args: CancelCampaignScheduleArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("campaign_schedules")
    .update({ enabled: false })
    .eq("id", args.schedule_id)
    .eq("tenant_id", tenantId);
  if (error) {
    throw error;
  }
  return { success: true, schedule_id: args.schedule_id, enabled: false };
}
