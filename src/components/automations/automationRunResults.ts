import {
  cfgString,
  isJsonObject,
  type JsonObject,
} from "@/lib/automationStepConfig";

export interface FlowStepResult {
  step_id?: string;
  action_type?: string;
  step_type?: string;
  success: boolean;
  error?: string;
  response?: JsonObject;
}

export function parseFlowStepResults(value: unknown): FlowStepResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject).map((step) => ({
    step_id: cfgString(step.step_id),
    action_type: cfgString(step.action_type),
    step_type: cfgString(step.step_type),
    success: Boolean(step.success),
    error: cfgString(step.error),
    response: isJsonObject(step.response) ? step.response : undefined,
  }));
}

export interface FacebookPreviewLead {
  leadgen_id: string;
  form_id: string;
  created_time: string;
  field_data: Record<string, string>;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isJsonObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

export function parseFacebookPreviewLeads(
  value: unknown,
): FacebookPreviewLead[] {
  if (!Array.isArray(value)) return [];
  const leads: FacebookPreviewLead[] = [];
  for (const item of value) {
    if (!isJsonObject(item)) continue;
    const { leadgen_id, form_id, created_time } = item;
    if (
      typeof leadgen_id !== "string" ||
      typeof form_id !== "string" ||
      typeof created_time !== "string"
    ) {
      continue;
    }
    leads.push({
      leadgen_id,
      form_id,
      created_time,
      field_data: toStringRecord(item.field_data),
    });
  }
  return leads;
}
