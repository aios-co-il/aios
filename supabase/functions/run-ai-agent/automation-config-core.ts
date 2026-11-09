import { z } from "npm:zod@3.25.76";

/** Preserves this portion of the automation editor configuration shape. */
export const automationCoreFields = {
  status: z.string().optional(),
  status_field: z.string().nullish(),
  message: z.string().optional(),
  to_email: z.string().optional(),
  email_field: z.string().optional(),
  hour: z.union([z.string(), z.number()]).optional(),
  minute: z.union([z.string(), z.number()]).optional(),
  carmen_session_mode: z.boolean().optional(),
  agent_id: z.string().nullish(),
  agent_profile: z.string().nullish(),
  allowed_phones: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional(),
  body_template: z.string().nullish(),
  calendar_title_filter: z.string().nullish(),
  carmen_allowed_group_id: z.string().nullish(),
  carmen_allowed_group_ids: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional(),
  carmen_allowed_phones: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional(),
  carmen_connection_user_id: z.string().nullish(),
  carmen_instructions: z.string().nullish(),
  carmen_integration_id: z.string().nullish(),
  carmen_open_member_groups: z.boolean().optional(),
  carmen_scope_mode: z.string().nullish(),
  client_id: z.string().nullish(),
  code: z.string().nullish(),
  condition_field: z.string().nullish(),
  condition_operator: z.string().nullish(),
  condition_value: z.string().nullish(),
  connection_user_id: z.string().nullish(),
  custom_fields: z
    .array(
      z.object({
        field_id: z.union([z.string(), z.number()]).optional(),
        field_name: z.string().optional(),
        value_template: z.string().optional(),
      }),
    )
    .optional(),
  default_agency_id: z.string().nullish(),
  default_campaigner_id: z.string().nullish(),
};
