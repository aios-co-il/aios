import { z } from "npm:zod@3.25.76";
const expectationSchema = z
  .union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.unknown()),
  ])
  .transform((value) =>
    typeof value === "string" ? value : JSON.stringify(value),
  );
const evalCaseSchema = z.object({
  input: z.string().optional().default(""),
  expected: expectationSchema.optional().default(""),
});
/** Preserve textual ground truth and serialize structured expectations for the judge. */
export function readEvalCase(value: unknown) {
  return evalCaseSchema.parse(value);
}
