import type { Tables } from "@/integrations/supabase/types";
import { cfgStringArray, parseStepConfig } from "./automationStepConfig";
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
    stored_configuration: s.configuration,
    position_x: Number.isFinite(s.position_x) ? s.position_x : 400,
    position_y: Number.isFinite(s.position_y) ? s.position_y : 80,
    sort_order: s.sort_order ?? 0,
    parent_step_id: s.parent_step_id,
    condition_branch: s.condition_branch,
    switch_branches: cfgStringArray(configuration.switch_branches),
  };
}

/** Preserve opaque stored extensions only when serializing the validated editor model. */
export function storedFlowStepConfig(
  node: FlowNodeData,
): Tables<"automation_flow_steps">["configuration"] {
  const value = node.stored_configuration;
  const stored =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...stored,
    ...node.configuration,
    ...(node.switch_branches ? { switch_branches: node.switch_branches } : {}),
  };
}

/** Reset stored settings and switch handles when selecting a different node kind. */
export function updateFlowNode(
  node: FlowNodeData,
  updates: Partial<FlowNodeData>,
): FlowNodeData {
  const typeChanged =
    ("step_type" in updates && updates.step_type !== node.step_type) ||
    ("action_type" in updates && updates.action_type !== node.action_type);
  return typeChanged
    ? {
        ...node,
        ...updates,
        configuration: updates.configuration ?? {},
        stored_configuration: {},
        switch_branches: updates.switch_branches,
      }
    : { ...node, ...updates };
}
