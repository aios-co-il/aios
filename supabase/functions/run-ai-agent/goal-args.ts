import { z } from "npm:zod@3.25.76";

/** LLM-supplied success criterion; extra fields (e.g. verification_config) are kept as sent. */
const successCriterionArgSchema = z
  .object({
    key: z.string().optional(),
    description: z.string(),
    required: z.boolean().optional(),
    verification_type: z.string().optional(),
    evidence_required: z.string().optional(),
  })
  .passthrough();

export type SuccessCriterionArg = z.infer<typeof successCriterionArgSchema>;

const argListSchema = z.array(z.unknown()).optional().catch(undefined);

/** Valid criteria of an LLM-supplied list; a missing or non-array value stays undefined. */
export function successCriterionArgs(
  value: unknown,
): SuccessCriterionArg[] | undefined {
  return argListSchema.parse(value)?.flatMap((entry) => {
    const criterion = successCriterionArgSchema.safeParse(entry);
    return criterion.success ? [criterion.data] : [];
  });
}
