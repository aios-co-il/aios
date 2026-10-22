// Pure helpers for recording automation runs in `automation_executions`.
// Kept free of Deno/Supabase imports so they can be unit-tested with node.

export type ExecutionStatus = "completed" | "failed";

export type ExecutionSummary = {
  status: ExecutionStatus;
  actions_count: number;
  error: string | null;
};

type SettledResult =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; reason: unknown };

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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
    const value = result.value as
      | { success?: boolean; skipped?: boolean; error?: unknown }
      | null
      | undefined;
    if (!value || value.skipped) continue;
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

/** Postgres unique_violation: another invocation already claimed this message. */
export function isDuplicateClaimError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}
