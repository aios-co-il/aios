import type { ScheduleCampaignToggleArgs } from "./campaign-schedule-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing schedule_campaign_toggle executor and side-effect order. */
export async function executeScheduleCampaignToggle(
  args: ScheduleCampaignToggleArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, agentId, actorUserId } = context;

  const nextRun =
    args.run_at ||
    (args.cron_expression ? new Date(Date.now() + 60_000).toISOString() : null);
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: "schedule_campaign_toggle",
      title: `תזמון ${args.action} ל-${args.entity_id}`,
      description: args.cron_expression
        ? `cron: ${args.cron_expression} (${args.timezone || "Asia/Jerusalem"})`
        : `חד-פעמי: ${args.run_at}`,
      tool_name: "schedule_campaign_toggle",
      tool_input: { ...args, next_run_at: nextRun },
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return {
    pending_approval: true,
    approval_id: data.id,
    action: "schedule_campaign_toggle",
    summary: `תזמון ${args.action} ל-${args.entity_id}: ${args.cron_expression || args.run_at}`,
    instruction_for_carmen:
      'הצג את התזמון ובקש אישור. רק אחרי "כן" קוראת ל-execute_pending_approval — והוא ייצור את הרשומה ב-campaign_schedules.',
  };
}
