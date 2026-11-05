// trigger-automation records one automation_executions row per call, after its
// automations finish, and only when at least one of them ran (AIO-204).

export type ExecutionSummary = {
  status: "completed" | "failed";
  actions_count: number;
  error: string | null;
};

type SettledResult = PromiseSettledResult<unknown>;

/**
 * Summarizes the per-automation results of one trigger call.
 * `actions_count` counts only automations that actually ran: skipped ones
 * (`skipped: true`, or conditions not met → `undefined`) are not counted.
 * A run is "failed" when any automation threw or reported `success: false`.
 */
export function summarizeExecution(results: SettledResult[]): ExecutionSummary {
  const errors: string[] = [];
  let ran = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      ran++;
      errors.push(errorText(result.reason));
      continue;
    }
    const value = automationResult(result.value);
    if (!value || value.skipped) {
      continue;
    }
    ran++;
    if (value.success === false) {
      errors.push(
        value.error ? errorText(value.error) : "automation reported failure",
      );
    }
  }
  return {
    status: errors.length > 0 ? "failed" : "completed",
    actions_count: ran,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
  };
}

type AutomationResult = {
  success?: unknown;
  skipped?: unknown;
  error?: unknown;
};

/** One automation's result object, or null when its conditions were not met. */
function automationResult(value: unknown): AutomationResult | null {
  return typeof value === "object" && value !== null ? value : null;
}

/** An error's message, a string as is, anything else as JSON. */
function errorText(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? "unknown error";
  } catch {
    return "unserializable error";
  }
}
