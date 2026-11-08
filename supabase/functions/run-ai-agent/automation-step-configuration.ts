import { z } from "npm:zod@3.25.76";

/** Configuration fields supported by the automation editor and draft builder. */
export const automationStepConfigurationSchema = z
  .object({
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
    input_count: z.number().nullish(),
    integration_id: z.string().nullish(),
    keyword: z.string().nullish(),
    lead_source: z.string().nullish(),
    list_id: z.string().nullish(),
    loop_field: z.string().nullish(),
    manual_group_id: z.string().nullish(),
    manual_phone: z.string().nullish(),
    manychat_delivery: z.string().nullish(),
    manychat_flow_ns: z.string().nullish(),
    manychat_tag_id: z.union([z.string(), z.number()]).nullish(),
    media_filename: z.string().nullish(),
    media_type: z.string().nullish(),
    media_url: z.string().nullish(),
    message_template: z.string().nullish(),
    meta_whatsapp_integration_id: z.string().nullish(),
    method: z.string().nullish(),
    min_interval_hours: z.number().nullish(),
    output_format: z.string().nullish(),
    phone_field: z.string().nullish(),
    phone_mode: z.string().nullish(),
    prompt_template: z.string().nullish(),
    recipient_email_field: z.string().nullish(),
    recipient_name_field: z.string().nullish(),
    recipients: z
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
    reply_to: z.string().nullish(),
    schedule_day: z.string().nullish(),
    schedule_day_of_month: z.number().nullish(),
    schedule_time: z.string().nullish(),
    selected_group_ids: z
      .array(z.unknown())
      .transform((items) =>
        items.filter((item): item is string => typeof item === "string"),
      )
      .optional(),
    send_mode: z.string().nullish(),
    send_target: z.string().nullish(),
    send_to_type: z.string().nullish(),
    sender_domain_id: z.string().nullish(),
    session_timeout_minutes: z.number().nullish(),
    sheet_id: z.string().nullish(),
    sheet_name: z.string().nullish(),
    skin_slugs: z
      .array(z.unknown())
      .transform((items) =>
        items.filter((item): item is string => typeof item === "string"),
      )
      .optional(),
    source_filter: z.string().nullish(),
    step_instruction: z.string().nullish(),
    stripe_event: z.string().nullish(),
    subject_template: z.string().nullish(),
    switch_branches: z
      .array(z.unknown())
      .transform((items) =>
        items.filter((item): item is string => typeof item === "string"),
      )
      .optional(),
    switch_field: z.string().nullish(),
    sync_since_date: z.string().nullish(),
    tag_id: z.union([z.string(), z.number()]).nullish(),
    task_due_days: z.number().nullish(),
    task_id: z.string().nullish(),
    task_notes_template: z.string().nullish(),
    task_priority: z.number().nullish(),
    task_title_template: z.string().nullish(),
    telegram_bot_token: z.string().nullish(),
    telegram_chat_id: z.string().nullish(),
    telegram_keyword: z.string().nullish(),
    telegram_parse_mode: z.string().nullish(),
    template_document_id: z.string().nullish(),
    template_id: z.string().nullish(),
    template_language: z.string().nullish(),
    template_name: z.string().nullish(),
    template_variables: z
      .array(z.unknown())
      .transform((items) =>
        items.filter((item): item is string => typeof item === "string"),
      )
      .optional(),
    trigger_keyword: z.string().nullish(),
    trigger_keywords: z
      .array(z.unknown())
      .transform((items) =>
        items.filter((item): item is string => typeof item === "string"),
      )
      .optional(),
    trigger_types: z
      .array(z.unknown())
      .transform((items) =>
        items.filter((item): item is string => typeof item === "string"),
      )
      .optional(),
    update_field: z.string().nullish(),
    update_field_value: z.union([z.string(), z.number()]).nullish(),
    update_template: z.string().nullish(),
    url: z.string().nullish(),
    wa_provider: z.string().nullish(),
    webhook_secret: z.string().nullish(),
  })
  .strict();
