import { automationCoreFields } from "./automation-config-core.ts";
import { automationDeliveryFields } from "./automation-config-delivery.ts";
import { automationTriggerFields } from "./automation-config-triggers.ts";
import { z } from "npm:zod@3.25.76";

/** Configuration fields supported by the automation editor and draft builder. */
export const automationStepConfigurationSchema = z
  .object({
    ...automationCoreFields,
    ...automationDeliveryFields,
    ...automationTriggerFields,
  })
  .strict();
