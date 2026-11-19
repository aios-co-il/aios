const FLOW_STEP_TYPES = [
  "trigger",
  "action",
  "condition",
  "switch",
  "delay",
  "agent",
  "whatsapp_session",
  "merge",
  "loop",
  "code",
  "error_branch",
] as const;

export type FlowStepType = (typeof FLOW_STEP_TYPES)[number];

export type StoredFlowStepType = FlowStepType | (string & {});
