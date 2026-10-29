import { z } from "npm:zod@3.25.76";
import {
  jsonObjectSchema,
  type JsonObject,
} from "../_shared/automation-json.ts";

/** Request body accepted by trigger-automation. Unknown keys are kept. */
export type AutomationPayload = {
  trigger_type?: string | null;
  triggerType?: string | null;
  data?: JsonObject | null;
  tenant_id?: string | null;
  // Support direct automation execution by ID
  automationId?: string | null;
  payload?: JsonObject | null;
  // Source separation: 'crm' = only CRM automations, 'flow' = only the specific flow
  source?: string | null;
  _execution_id?: string | null;
  _execution_depth?: number | null;
  _execution_chain?: string[] | null;
};

const optionalString = z.string().nullish();

export const automationPayloadSchema: z.ZodType<
  AutomationPayload,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    trigger_type: optionalString,
    triggerType: optionalString,
    data: jsonObjectSchema.nullish(),
    tenant_id: optionalString,
    automationId: optionalString,
    payload: jsonObjectSchema.nullish(),
    source: optionalString,
    _execution_id: optionalString,
    _execution_depth: z.union([z.number(), z.nan()]).nullish(),
    _execution_chain: z.array(z.string()).nullish(),
  })
  .passthrough();
