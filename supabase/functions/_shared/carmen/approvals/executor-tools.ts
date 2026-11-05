/**
 * tool_names carmen-approval-execute can run (besides action_type='agent_direct_tool').
 * A test checks each one against the executor's source.
 */
export const CARMEN_EXECUTOR_TOOLS: readonly string[] = Object.freeze([
  "fb_create_campaign",
  "fb_create_adset",
  "fb_create_ad",
  "fb_create_creative_from_media",
  "fb_replace_lead_form",
  "fb_update_budget",
  "fb_pause",
  "fb_resume",
  "fb_duplicate_ad_variants",
  "duplicate_facebook_ad_variants",
  "update_facebook_budget",
  "toggle_facebook_campaign",
  "duplicate_facebook_campaign",
  "gads_pause",
  "gads_resume",
  "gads_update_budget",
  "schedule_campaign_toggle",
  "create_automation",
  "toggle_automation",
  "delete_automation",
  "edit_automation",
  "send_broadcast_now",
  "schedule_broadcast",
  "cancel_broadcast",
  "create_one_time_income",
  "delete_one_time_income",
  "record_income_payment",
  "delete_income_payment",
  "record_expense_payment",
  "delete_expense_payment",
  "update_client_retainer",
  "set_pulse_target",
]);

/** A row carmen-approval-execute knows how to run (not a run-ai-agent-v2 run step). */
export function isCarmenExecutableApproval(
  row: ExecutorRow | null | undefined,
): boolean {
  if (!row || row.run_id) {
    return false;
  }

  return hasCarmenExecutor(row);
}

/** carmen-approval-execute has a route for this row's tool, run step or not. */
export function hasCarmenExecutor(row: ExecutorRow): boolean {
  return (
    row.action_type === "agent_direct_tool" ||
    CARMEN_EXECUTOR_TOOL_SET.has(String(row.tool_name || ""))
  );
}

/** The row's expires_at has passed; rows without one never expire. */
export function isApprovalExpired(
  row: { expires_at?: string | null } | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!row?.expires_at) {
    return false;
  }

  const t = Date.parse(row.expires_at);
  return Number.isFinite(t) && t <= nowMs;
}

/** The row fields that decide whether the executor can run it. */
interface ExecutorRow {
  run_id?: string | null;
  action_type?: string | null;
  tool_name?: string | null;
}

const CARMEN_EXECUTOR_TOOL_SET = new Set(CARMEN_EXECUTOR_TOOLS);
