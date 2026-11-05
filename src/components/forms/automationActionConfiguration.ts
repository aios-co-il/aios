import { applyStatusActionFields } from "../../../supabase/functions/_shared/automation-status.ts";

/** The configuration stored for the form's action type. */
export function actionConfiguration(
  values: ActionFormValues,
): ActionConfiguration {
  switch (values.action_type) {
    case "webhook":
      return {
        url: values.webhook_url,
        method: values.webhook_method || "POST",
        headers: { "Content-Type": "application/json" },
        body_template: values.body_template || "",
      };
    case "update_status": {
      const cfg: StatusConfiguration = { entity: values.status_entity };
      applyStatusActionFields(cfg, values.status_value);
      if (values.update_field_name && values.update_field_name !== "none") {
        cfg.update_field = values.update_field_name;
        cfg.update_field_value = values.update_field_value || "today";
      }
      return cfg;
    }
    case "send_whatsapp":
      return {
        manychat_tag_id: values.manychat_tag_id,
        field_mapping: {
          date: values.field_mapping_date,
          time: values.field_mapping_time,
          location: values.field_mapping_location,
          contact: values.field_mapping_contact,
        },
      };
    case "create_manychat_subscriber":
      return { manychat_tag_id: values.manychat_tag_id || null };
    case "send_greenapi_message":
      return {
        message_template: values.message_template || "",
        integration_id: values.green_api_integration_id || null,
        send_to_type: values.greenapi_send_to_type || "contact",
        manual_phone: values.greenapi_manual_phone || null,
        manual_group_id: values.greenapi_manual_group_id || null,
      };
    case "send_greenapi_to_campaigner":
      return {
        message_template: values.message_template || "",
        send_target: values.campaigner_send_target || "phone",
        integration_id: values.green_api_integration_id || null,
      };
    case "add_lead_update":
    case "add_client_update":
      return { update_template: values.update_template || "" };
    case "create_task":
      return {
        task_title_template:
          values.task_title_template || "{{company_name}} - משימה חדשה",
        task_notes_template: values.task_notes_template || "",
        task_priority: values.task_priority || 5,
        task_due_days: values.task_due_days || 0,
      };
    default:
      return {};
  }
}

/** The add/edit automation form fields an action's configuration is built from. */
export type ActionFormValues = {
  action_type: string;
  webhook_url?: string;
  webhook_method?: string;
  body_template?: string;
  status_entity?: string;
  status_value?: string;
  update_field_name?: string;
  update_field_value?: string;
  manychat_tag_id?: string;
  field_mapping_date?: string;
  field_mapping_time?: string;
  field_mapping_location?: string;
  field_mapping_contact?: string;
  message_template?: string;
  green_api_integration_id?: string;
  greenapi_send_to_type?: string;
  greenapi_manual_phone?: string;
  greenapi_manual_group_id?: string;
  campaigner_send_target?: string;
  update_template?: string;
  task_title_template?: string;
  task_notes_template?: string;
  task_priority?: number;
  task_due_days?: number;
};

type WebhookConfiguration = {
  url?: string;
  method: string;
  headers: { "Content-Type": string };
  body_template: string;
};

type StatusConfiguration = {
  entity?: string;
  status?: string;
  status_field?: string;
  update_field?: string;
  update_field_value?: string;
};

type ManyChatWhatsAppConfiguration = {
  manychat_tag_id?: string;
  field_mapping: {
    date?: string;
    time?: string;
    location?: string;
    contact?: string;
  };
};

type ManyChatSubscriberConfiguration = { manychat_tag_id: string | null };

type GreenApiMessageConfiguration = {
  message_template: string;
  integration_id: string | null;
  send_to_type: string;
  manual_phone: string | null;
  manual_group_id: string | null;
};

type CampaignerMessageConfiguration = {
  message_template: string;
  send_target: string;
  integration_id: string | null;
};

type UpdateConfiguration = { update_template: string };

type TaskConfiguration = {
  task_title_template: string;
  task_notes_template: string;
  task_priority: number;
  task_due_days: number;
};

/** Actions without settings of their own (email, notification, create_lead). */
type EmptyConfiguration = Record<string, never>;

export type ActionConfiguration =
  | WebhookConfiguration
  | StatusConfiguration
  | ManyChatWhatsAppConfiguration
  | ManyChatSubscriberConfiguration
  | GreenApiMessageConfiguration
  | CampaignerMessageConfiguration
  | UpdateConfiguration
  | TaskConfiguration
  | EmptyConfiguration;
