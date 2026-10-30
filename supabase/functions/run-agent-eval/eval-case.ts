import { z } from "npm:zod@3.25.76";
import { jsonValueSchema } from "../_shared/agent-task-result.ts";

const evalCaseSchema = z
  .object({
    input: jsonValueSchema.optional().catch(undefined),
    expected: jsonValueSchema.optional().catch(undefined),
  })
  .catch({});

/** A dataset case's input/expected values; "" when missing or the case is not an object. */
export function readEvalCase(testCase: unknown) {
  const { input, expected } = evalCaseSchema.parse(testCase);
  return { input: input ?? "", expected: expected ?? "" };
}
