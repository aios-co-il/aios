import type { z } from "npm:zod@3.25.76";

/** Keep rejected tool input actionable without logging input values. */
export function invalidToolInput(context: string, error: z.ZodError): Error {
  console.warn(
    `[tools] Invalid ${context}`,
    error.issues.map((issue) => issue.path),
  );
  const detail = error.issues
    .map((issue) => `${issue.path.join(".") || context}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid ${context}: ${detail}`);
}
