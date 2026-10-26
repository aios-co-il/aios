import type { Tables } from "@/integrations/supabase/types";
import { cfgStringArray, parseStepConfig } from "@/lib/automationStepConfig";
import type { FlowNodeData } from "./FlowNode";

export function flowStepRowToNodeData(
  s: Tables<"automation_flow_steps">,
): FlowNodeData {
  const configuration = parseStepConfig(s.configuration);
  return {
    id: s.id,
    step_type: s.step_type,
    action_type: s.action_type ?? undefined,
    label: s.label ?? undefined,
    configuration,
    position_x: Number.isFinite(s.position_x) ? s.position_x : 400,
    position_y: Number.isFinite(s.position_y) ? s.position_y : 80,
    sort_order: s.sort_order ?? 0,
    parent_step_id: s.parent_step_id,
    condition_branch: s.condition_branch,
    switch_branches: cfgStringArray(configuration.switch_branches),
  };
}
