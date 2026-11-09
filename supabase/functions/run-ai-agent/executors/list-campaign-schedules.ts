import type { ListCampaignSchedulesArgs } from "./campaign-schedule-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing list_campaign_schedules executor and side-effect order. */
export async function executeListCampaignSchedules(
  args: ListCampaignSchedulesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("campaign_schedules")
    .select(
      "id, entity_id, entity_type, action, cron_expression, run_at, timezone, enabled, next_run_at, last_run_at, last_run_status, notes",
    )
    .eq("tenant_id", tenantId)
    .order("next_run_at", { ascending: true })
    .limit(args.limit || 50);
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  if (args.only_enabled) {
    q = q.eq("enabled", true);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return { count: data.length, schedules: data };
}
