import { z } from "zod";
import {
  listOf,
  optionalStringSchema,
  optionalTextSchema,
} from "./automationStepConfig";

/** The step response fields the run history shows. */
const stepResponseSchema = z.object({
  output: z.unknown(),
  message: z.unknown(),
  command_text: optionalTextSchema,
  subscriber_id: optionalTextSchema,
  message_sent: z.unknown(),
});

const flowStepResultSchema = z.object({
  step_id: optionalStringSchema,
  action_type: optionalStringSchema,
  step_type: optionalStringSchema,
  success: z.unknown().transform(Boolean),
  error: optionalStringSchema,
  response: stepResponseSchema.optional().catch(undefined),
});

export type FlowStepResult = z.infer<typeof flowStepResultSchema>;

const stringRecordSchema = z
  .record(z.unknown())
  .catch({})
  .transform((record) =>
    Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );

const facebookPreviewLeadSchema = z.object({
  leadgen_id: z.string(),
  form_id: z.string(),
  created_time: z.string(),
  field_data: stringRecordSchema,
});

export type FacebookPreviewLead = z.infer<typeof facebookPreviewLeadSchema>;

export function parseFlowStepResults(value: unknown): FlowStepResult[] {
  return listOf(flowStepResultSchema, value) ?? [];
}

export function parseFacebookPreviewLeads(
  value: unknown,
): FacebookPreviewLead[] {
  return listOf(facebookPreviewLeadSchema, value) ?? [];
}

const flowRunResponseSchema = z.object({
  flow: z.unknown(),
  steps: z.unknown().transform((value) => listOf(flowStepResultSchema, value)),
  agent_output: optionalTextSchema,
  output: optionalTextSchema,
});

/** What trigger-automation reports for one run; steps is set only for a list. */
export type FlowRunResponse = z.infer<typeof flowRunResponseSchema>;

export function parseFlowRunResponse(
  value: unknown,
): FlowRunResponse | undefined {
  const result = flowRunResponseSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

const runResultsSchema = z.object({ results: z.array(z.unknown()) });
const wrappedRunResultSchema = z.object({ response: z.unknown() });

/** The first automation's run response, unwrapped from `results[0].response`. */
export function firstFlowRunResponse(
  data: unknown,
): FlowRunResponse | undefined {
  const parsed = runResultsSchema.safeParse(data);
  if (!parsed.success) {
    return undefined;
  }
  const first = parsed.data.results[0];
  const wrapped = wrappedRunResultSchema.safeParse(first);
  return (
    (wrapped.success
      ? parseFlowRunResponse(wrapped.data.response)
      : undefined) ?? parseFlowRunResponse(first)
  );
}
