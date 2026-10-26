import type { Json, TablesInsert } from "../_shared/database.types.ts";
import {
  isJsonObject,
  type JsonObject,
  textOr,
} from "../_shared/json-narrow.ts";

export type FlowStepRow = TablesInsert<"automation_flow_steps">;

export const MAX_FLOW_STEPS = 20;

/** The step specs that will be built, or null when any of them is not an object. */
export function flowStepSpecs(steps: Json[]): JsonObject[] | null {
  const specs = steps.slice(0, MAX_FLOW_STEPS);
  return specs.every(isJsonObject) ? specs : null;
}

type FlowStepInput = {
  automationId: string;
  tenantId: string;
  triggerType: string;
  triggerConfig: Json;
  agentId: string | null;
  steps: JsonObject[];
  newId?: () => string;
};

/** Trigger node followed by a linear chain of agent/action steps. */
export function buildFlowStepRows(input: FlowStepInput): FlowStepRow[] {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const trigId = newId();
  const rows: FlowStepRow[] = [
    {
      id: trigId,
      automation_id: input.automationId,
      tenant_id: input.tenantId,
      step_type: "trigger",
      action_type: input.triggerType,
      configuration: input.triggerConfig,
      position_x: 400,
      position_y: 60,
      sort_order: 0,
      parent_step_id: null,
      condition_branch: null,
      label: "טריגר",
    },
  ];
  let parent = trigId;
  let y = 60;
  input.steps.forEach((s, index) => {
    y += 130;
    const id = newId();
    const type = String(s.type || "agent");
    let action_type: string | null = null;
    let config: JsonObject =
      s.config && typeof s.config === "object"
        ? Object.fromEntries(Object.entries<Json | undefined>(s.config))
        : {};
    if (type === "agent") {
      action_type = "agent";
      config = {
        agent_id: input.agentId,
        skin_slugs: s.skin ? [String(s.skin)] : [],
        step_instruction: s.instruction || "",
        ...config,
      };
    } else if (type === "action") {
      action_type = s.action_type ? String(s.action_type) : "notification";
    }
    rows.push({
      id,
      automation_id: input.automationId,
      tenant_id: input.tenantId,
      step_type: type,
      action_type,
      configuration: config,
      position_x: 400,
      position_y: y,
      sort_order: index + 1,
      parent_step_id: parent,
      condition_branch: null,
      label: textOr(s.label, type),
    });
    parent = id;
  });
  return rows;
}
