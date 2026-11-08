/** One flow execution step on the trigger-automation wire boundary. */
export type FlowStepResult = {
  step_id: string;
  action_type: string | null;
  success: boolean;
  response?: unknown;
  error?: unknown;
};
