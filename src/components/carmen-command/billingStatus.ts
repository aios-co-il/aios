import { z } from "zod";
const tokens = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  num_model_requests: z.number(),
});
const billingStatusSchema = z.object({
  ok: z.boolean(),
  admin_available: z.boolean(),
  error: z.string().optional(),
  period: z.string().optional(),
  currency: z.string().optional(),
  current_month_usage_cost: z.number().nullable().optional(),
  current_month_usage_tokens: tokens.nullable().optional(),
  line_items: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .optional(),
  daily_costs: z
    .array(
      z.object({
        date: z.string(),
        cost: z.number(),
        line_items: z.record(z.number()).optional(),
      }),
    )
    .optional(),
  daily_usage: z
    .array(
      z.object({
        date: z.string(),
        total_tokens: z.number(),
        num_model_requests: z.number(),
      }),
    )
    .optional(),
  remaining_credit_available: z.boolean().optional(),
  remaining_credit_reason: z.string().optional(),
  limits: z
    .object({
      available: z.boolean(),
      reason: z.string().optional(),
      raw: z.unknown(),
    })
    .optional(),
  apis_used: z.record(z.string().nullable()).optional(),
  unavailable_fields: z.record(z.string().nullable()).optional(),
  errors: z
    .object({
      costs: z.string().nullable().optional(),
      usage: z.string().nullable().optional(),
      spend_limits: z.string().nullable().optional(),
    })
    .optional(),
});
export type OpenAiBillingStatus = z.infer<typeof billingStatusSchema>;
/** Validate the billing response before metrics reach the overview cards. */
export function readOpenAiBillingStatus(value: unknown): OpenAiBillingStatus {
  const parsed = billingStatusSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid billing response");
  }
  return parsed.data;
}
