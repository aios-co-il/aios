import { z } from "npm:zod@3.25.76";

/** Preserves this portion of the automation editor configuration shape. */
export const automationDeliveryFields = {
  delay_unit: z.string().nullish(),
  delay_value: z.number().nullish(),
  document_title_template: z.string().nullish(),
  email_recipients: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("phone_field"), field: z.string() }),
        z.object({ type: z.literal("phone_manual"), phone: z.string() }),
        z.object({ type: z.literal("group_manual"), group_id: z.string() }),
        z.object({ type: z.literal("group_field"), field: z.string() }),
        z.object({ type: z.literal("group_lookup"), group_id: z.string() }),
        z.object({
          type: z.literal("contact_lookup"),
          entity: z.enum(["lead", "client"]),
          id: z.string(),
        }),
        z.object({ type: z.literal("email_field"), field: z.string() }),
        z.object({ type: z.literal("email_manual"), email: z.string() }),
      ]),
    )
    .optional(),
  email_sender_filter: z.string().nullish(),
  email_subject_filter: z.string().nullish(),
  end_keyword: z.string().nullish(),
  entity: z.string().nullish(),
  excluded_group_ids: z
    .array(z.unknown())
    .transform((items) =>
      items.filter((item): item is string => typeof item === "string"),
    )
    .optional(),
  external_api_token: z.string().nullish(),
  external_instance_id: z.string().nullish(),
  facebook_form_fields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
  facebook_form_id: z.string().nullish(),
  facebook_form_name: z.string().nullish(),
  facebook_integration_id: z.string().nullish(),
  facebook_page_id: z.string().nullish(),
  facebook_page_name: z.string().nullish(),
  field_mapping: z.record(z.string(), z.string()).optional(),
  filter_status: z.union([z.string(), z.number()]).nullish(),
  filter_status_kind: z.string().nullish(),
  filter_statuses: z
    .array(
      z.union([
        z.string(),
        z.object({ value: z.string(), kind: z.string().nullable() }),
      ]),
    )
    .optional(),
  from_local: z.string().nullish(),
  from_mode: z.string().nullish(),
  from_name: z.string().nullish(),
  green_api_integration_id: z.string().nullish(),
  green_api_mode: z.string().nullish(),
  group_id: z.string().nullish(),
  group_id_field: z.string().nullish(),
  inactive_days: z.number().nullish(),
  include_context: z.boolean().optional(),
};
