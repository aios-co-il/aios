import { z } from "zod";
import {
  jsonObjectSchema,
  listOf,
  optionalStringSchema,
} from "./automationStepConfig";

const flowStepResultSchema = z.object({
  step_id: optionalStringSchema,
  action_type: optionalStringSchema,
  step_type: optionalStringSchema,
  success: z.unknown().transform(Boolean),
  error: optionalStringSchema,
  response: jsonObjectSchema.optional().catch(undefined),
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
