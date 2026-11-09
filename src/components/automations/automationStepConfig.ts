import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

// Opaque values occur only in stored recipient extensions and external webhook bodies.
// Known editor configuration fields are validated by stepConfigSchema below.
const storedJsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(storedJsonValueSchema),
    z.record(z.string(), storedJsonValueSchema),
  ]),
);
export const jsonObjectSchema = z.record(z.string(), storedJsonValueSchema);
export type WebhookPayload = z.infer<typeof jsonObjectSchema>;

export const stepConfigSchema = z.object({
  status: z.string().optional().catch(undefined),
  status_field: z.string().nullish().catch(undefined),
  message: z.string().optional().catch(undefined),
  to_email: z.string().optional().catch(undefined),
  email_field: z.string().optional().catch(undefined),
  hour: z.union([z.string(), z.number()]).optional().catch(undefined),
  minute: z.union([z.string(), z.number()]).optional().catch(undefined),
  carmen_session_mode: z.boolean().optional().catch(undefined),
  agent_id: z.string().nullish().catch(undefined),
  agent_profile: z.string().nullish().catch(undefined),
  allowed_phones: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  body_template: z.string().nullish().catch(undefined),
  calendar_title_filter: z.string().nullish().catch(undefined),
  carmen_allowed_group_id: z.string().nullish().catch(undefined),
  carmen_allowed_group_ids: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  carmen_allowed_phones: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  carmen_connection_user_id: z.string().nullish().catch(undefined),
  carmen_instructions: z.string().nullish().catch(undefined),
  carmen_integration_id: z.string().nullish().catch(undefined),
  carmen_open_member_groups: z.boolean().optional().catch(undefined),
  carmen_scope_mode: z.string().nullish().catch(undefined),
  client_id: z.string().nullish().catch(undefined),
  code: z.string().nullish().catch(undefined),
  condition_field: z.string().nullish().catch(undefined),
  condition_operator: z.string().nullish().catch(undefined),
  condition_value: z.string().nullish().catch(undefined),
  connection_user_id: z.string().nullish().catch(undefined),
  custom_fields: z
    .array(
      z.object({
        field_id: z.union([z.string(), z.number()]).optional(),
        field_name: z.string().optional(),
        value_template: z.string().optional(),
      }),
    )
    .optional()
    .catch(undefined),
  default_agency_id: z.string().nullish().catch(undefined),
  default_campaigner_id: z.string().nullish().catch(undefined),
  delay_unit: z.string().nullish().catch(undefined),
  delay_value: z.number().nullish().catch(undefined),
  document_title_template: z.string().nullish().catch(undefined),
  email_recipients: z.array(storedJsonValueSchema).optional().catch(undefined),
  email_sender_filter: z.string().nullish().catch(undefined),
  email_subject_filter: z.string().nullish().catch(undefined),
  end_keyword: z.string().nullish().catch(undefined),
  entity: z.string().nullish().catch(undefined),
  excluded_group_ids: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  external_api_token: z.string().nullish().catch(undefined),
  external_instance_id: z.string().nullish().catch(undefined),
  facebook_form_fields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional()
    .catch(undefined),
  facebook_form_id: z.string().nullish().catch(undefined),
  facebook_form_name: z.string().nullish().catch(undefined),
  facebook_integration_id: z.string().nullish().catch(undefined),
  facebook_page_id: z.string().nullish().catch(undefined),
  facebook_page_name: z.string().nullish().catch(undefined),
  field_mapping: z.record(z.string(), z.string()).optional().catch(undefined),
  filter_status: z.union([z.string(), z.number()]).nullish().catch(undefined),
  filter_status_kind: z.string().nullish().catch(undefined),
  filter_statuses: z
    .array(
      z.union([
        z.string(),
        z.object({ value: z.string(), kind: z.string().nullable() }),
      ]),
    )
    .optional()
    .catch(undefined),
  from_local: z.string().nullish().catch(undefined),
  from_mode: z.string().nullish().catch(undefined),
  from_name: z.string().nullish().catch(undefined),
  green_api_integration_id: z.string().nullish().catch(undefined),
  green_api_mode: z.string().nullish().catch(undefined),
  group_id: z.string().nullish().catch(undefined),
  group_id_field: z.string().nullish().catch(undefined),
  inactive_days: z.number().nullish().catch(undefined),
  include_context: z.boolean().optional().catch(undefined),
  input_count: z.number().int().min(1).max(20).nullish().catch(undefined),
  integration_id: z.string().nullish().catch(undefined),
  keyword: z.string().nullish().catch(undefined),
  lead_source: z.string().nullish().catch(undefined),
  list_id: z.string().nullish().catch(undefined),
  loop_field: z.string().nullish().catch(undefined),
  manual_group_id: z.string().nullish().catch(undefined),
  manual_phone: z.string().nullish().catch(undefined),
  manychat_delivery: z.string().nullish().catch(undefined),
  manychat_flow_ns: z.string().nullish().catch(undefined),
  manychat_tag_id: z.union([z.string(), z.number()]).nullish().catch(undefined),
  media_filename: z.string().nullish().catch(undefined),
  media_type: z.string().nullish().catch(undefined),
  media_url: z.string().nullish().catch(undefined),
  message_template: z.string().nullish().catch(undefined),
  meta_whatsapp_integration_id: z.string().nullish().catch(undefined),
  method: z.string().nullish().catch(undefined),
  min_interval_hours: z.number().nullish().catch(undefined),
  output_format: z.string().nullish().catch(undefined),
  phone_field: z.string().nullish().catch(undefined),
  phone_mode: z.string().nullish().catch(undefined),
  prompt_template: z.string().nullish().catch(undefined),
  recipient_email_field: z.string().nullish().catch(undefined),
  recipient_name_field: z.string().nullish().catch(undefined),
  recipients: z.array(storedJsonValueSchema).optional().catch(undefined),
  reply_to: z.string().nullish().catch(undefined),
  schedule_day: z.string().nullish().catch(undefined),
  schedule_day_of_month: z.number().nullish().catch(undefined),
  schedule_time: z.string().nullish().catch(undefined),
  selected_group_ids: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  send_mode: z.string().nullish().catch(undefined),
  send_target: z.string().nullish().catch(undefined),
  send_to_type: z.string().nullish().catch(undefined),
  sender_domain_id: z.string().nullish().catch(undefined),
  session_timeout_minutes: z.number().nullish().catch(undefined),
  sheet_id: z.string().nullish().catch(undefined),
  sheet_name: z.string().nullish().catch(undefined),
  skin_slugs: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  source_filter: z.string().nullish().catch(undefined),
  step_instruction: z.string().nullish().catch(undefined),
  stripe_event: z.string().nullish().catch(undefined),
  subject_template: z.string().nullish().catch(undefined),
  switch_branches: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  switch_field: z.string().nullish().catch(undefined),
  sync_since_date: z.string().nullish().catch(undefined),
  tag_id: z.union([z.string(), z.number()]).nullish().catch(undefined),
  task_due_days: z.number().nullish().catch(undefined),
  task_id: z.string().nullish().catch(undefined),
  task_notes_template: z.string().nullish().catch(undefined),
  task_priority: z.number().nullish().catch(undefined),
  task_title_template: z.string().nullish().catch(undefined),
  telegram_bot_token: z.string().nullish().catch(undefined),
  telegram_chat_id: z.string().nullish().catch(undefined),
  telegram_keyword: z.string().nullish().catch(undefined),
  telegram_parse_mode: z.string().nullish().catch(undefined),
  template_document_id: z.string().nullish().catch(undefined),
  template_id: z.string().nullish().catch(undefined),
  template_language: z.string().nullish().catch(undefined),
  template_name: z.string().nullish().catch(undefined),
  template_variables: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  trigger_keyword: z.string().nullish().catch(undefined),
  trigger_keywords: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  trigger_types: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional()
    .catch(undefined),
  update_field: z.string().nullish().catch(undefined),
  update_field_value: z
    .union([z.string(), z.number()])
    .nullish()
    .catch(undefined),
  update_template: z.string().nullish().catch(undefined),
  url: z.string().nullish().catch(undefined),
  wa_provider: z.string().nullish().catch(undefined),
  webhook_secret: z.string().nullish().catch(undefined),
});
export type StepConfig = z.infer<typeof stepConfigSchema>;
export type StepConfigValue = StepConfig[keyof StepConfig];
export type StepConfigChange = <K extends keyof StepConfig>(
  key: K,
  value: StepConfig[K],
) => void;
export type StepConfigBulkChange = (updates: Partial<StepConfig>) => void;

const numberSchema = z.union([z.number(), z.nan()]);

export const textSchema = z.union([
  z.string(),
  numberSchema.transform(String),
  z.boolean().transform(String),
]);

export const optionalStringSchema = z.string().optional().catch(undefined);
export const optionalTextSchema = textSchema.optional().catch(undefined);

const numericSchema = z.union([
  numberSchema,
  z
    .string()
    .refine((value) => value.trim() !== "")
    .transform(Number)
    .refine(Number.isFinite),
]);

const jsonTextSchema = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid JSON" });
    return z.NEVER;
  }
});

export const jsonObjectTextSchema = jsonTextSchema.pipe(jsonObjectSchema);

const errorLikeSchema = z.object({ message: z.string() });

function parsed<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function listOf<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T[] | undefined {
  return parsed(z.array(z.unknown()), value)?.flatMap((item) => {
    const result = schema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

/** Parse stored flow configuration into the editor's explicit field contracts. */
export function parseStepConfig(config: unknown): StepConfig {
  if (typeof config === "string") {
    try {
      config = JSON.parse(config);
    } catch {
      return {};
    }
  }
  const parsed = stepConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : {};
}

export function cfgString(value: unknown): string | undefined {
  return parsed(z.string(), value);
}

export function cfgText(value: unknown): string | undefined {
  return parsed(textSchema, value);
}

export function cfgNumber(value: unknown): number | undefined {
  return parsed(numberSchema, value);
}

export function cfgNumeric(value: unknown): number | undefined {
  return parsed(numericSchema, value);
}

export function cfgBool(value: unknown): boolean | undefined {
  return parsed(z.boolean(), value);
}

export function cfgStringArray(value: unknown): string[] | undefined {
  return listOf(z.string(), value);
}

export function errorMessage(error: unknown): string | undefined {
  return parsed(errorLikeSchema, error)?.message;
}

export function cfgTextArray(value: unknown): string[] | undefined {
  return listOf(textSchema, value);
}
