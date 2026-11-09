import type { GetAutomationDetailsArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AutomationFlowStepRow } from "../tool-contracts-marketing.ts";
import { readAutomationStepSummary } from "../tool-storage-contracts.ts";

/** Preserves the existing get_automation_details executor and side-effect order. */
export async function executeGetAutomationDetails(
  args: GetAutomationDetailsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let automationId = args.automation_id as string | undefined;
  if (!automationId && args.name_search) {
    const { data: found } = await supabase
      .from("automations")
      .select("id")
      .in("tenant_id", accessibleTenantIds)
      .ilike("name", `%${args.name_search}%`)
      .limit(1)
      .maybeSingle();
    automationId = found?.id;
  }
  if (!automationId) {
    return { error: "automation_id או name_search נדרש" };
  }
  const { data: auto, error } = await supabase
    .from("automations")
    .select(
      "id, name, description, active, trigger_type, configuration, is_flow, created_at, updated_at",
    )
    .eq("id", automationId)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  if (error || !auto) {
    return { error: "אוטומציה לא נמצאה" };
  }
  const { data: steps } = await supabase
    .from("automation_flow_steps")
    .select(
      "id, step_type, action_type, label, configuration, sort_order, parent_step_id, condition_branch, position_x, position_y",
    )
    .eq("automation_id", automationId)
    .order("sort_order", { ascending: true });
  const stepRows: Array<AutomationFlowStepRow> = steps || [];
  return {
    automation: auto,
    steps: stepRows.map((s) => {
      const configuration = readAutomationStepSummary(s.configuration);
      return {
        id: s.id,
        step_type: s.step_type,
        action_type: s.action_type,
        label: s.label,
        sort_order: s.sort_order,
        parent_step_id: s.parent_step_id,
        condition_branch: s.condition_branch,
        skin_slugs: configuration.skin_slugs || null,
        step_instruction: configuration.step_instruction || null,
        agent_id: configuration.agent_id || null,
        facebook_form_id: configuration.facebook_form_id || null,
        config_keys: s.configuration ? Object.keys(s.configuration) : [],
      };
    }),
    steps_count: steps?.length || 0,
  };
}
