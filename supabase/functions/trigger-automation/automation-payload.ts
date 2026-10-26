import { isObject, type UnknownRecord } from "../_shared/automation-json.ts";

/** Request body accepted by trigger-automation. Unknown keys are kept. */
export type AutomationPayload = {
  trigger_type?: string | null;
  triggerType?: string | null;
  data?: UnknownRecord | null;
  tenant_id?: string | null;
  // Support direct automation execution by ID
  automationId?: string | null;
  payload?: UnknownRecord | null;
  // Source separation: 'crm' = only CRM automations, 'flow' = only the specific flow
  source?: string | null;
  _execution_id?: string | null;
  _execution_depth?: number | null;
  _execution_chain?: string[] | null;
};

const STRING_FIELDS = [
  "trigger_type",
  "triggerType",
  "tenant_id",
  "automationId",
  "source",
  "_execution_id",
] as const;

const optional = (value: unknown, check: (item: unknown) => boolean) =>
  value == null || check(value);

const isString = (value: unknown) => typeof value === "string";

export function isAutomationPayload(
  value: unknown,
): value is AutomationPayload {
  if (!isObject(value)) return false;
  return (
    STRING_FIELDS.every((key) => optional(value[key], isString)) &&
    optional(value.data, isObject) &&
    optional(value.payload, isObject) &&
    optional(value._execution_depth, (item) => typeof item === "number") &&
    optional(
      value._execution_chain,
      (item) => Array.isArray(item) && item.every(isString),
    )
  );
}
