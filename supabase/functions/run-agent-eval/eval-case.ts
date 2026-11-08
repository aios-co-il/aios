import { z } from "npm:zod@3.25.76";

const evalCaseSchema = z
  .object({
    input: z.string().optional().catch(undefined),
    expected: z.string().optional().catch(undefined),
  })
  .catch({});

/** A dataset case's input/expected values; "" when missing or the case is not an object. */
export function readEvalCase(testCase: unknown) {
  const { input, expected } = evalCaseSchema.parse(testCase);
  return { input: input ?? "", expected: expected ?? "" };
}
