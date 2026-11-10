import type { Json } from "../../_shared/database.types.ts";

export type ListAutomationsArgs = {
  limit?: number;
  active_only?: boolean;
  name_search?: string;
};

export type GetAutomationDetailsArgs = {
  automation_id?: string;
  name_search?: string;
};

export type ProposeAutomationEditArgs = {
  automation_id: string;
  name?: string;
  description?: string;
  trigger_type?: string;
  trigger_config?: Json;
  steps?: Array<Json>;
};

export type ProposeAutomationArgs = {
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config?: Json;
  steps: Array<{
    type: "agent" | "action" | "condition" | "delay" | "merge";
    skin?: string;
    instruction?: string;
    action_type?: string;
    config?: Json;
    label?: string;
  }>;
};

export type InspectMetaLeadFormsArgs = {
  automation_name?: string;
  page_name?: string;
  form_name?: string;
};

export type SetAutomationMetaLeadFormArgs = {
  automation_id?: string;
  automation_name?: string;
  form_name: string;
  page_name?: string;
  confirmed: boolean;
};

export type CreateMetaLeadFormArgs = {
  page_name: string;
  form_name: string;
  questions: Array<{ type: string; label?: string }>;
  privacy_policy_url: string;
  privacy_policy_link_text?: string;
  follow_up_action_url: string;
  automation_id?: string;
  automation_name?: string;
  confirmed: boolean;
};
