import { z } from "npm:zod@3.25.76";
import { automationStepConfigurationSchema } from "./automation-step-configuration.ts";
import { invalidToolInput } from "./tool-input-errors.ts";

/** Validate the trigger selector without stripping other saved action settings. */
export function readLeadTriggerConfiguration(
  value: unknown,
): LeadTriggerConfiguration {
  const parsed = leadTriggerFields.passthrough().safeParse(value ?? {});
  if (!parsed.success) {
    throw invalidToolInput("lead trigger configuration", parsed.error);
  }
  return parsed.data;
}

const leadTriggerFields = automationStepConfigurationSchema.pick({
  lead_source: true,
});
export type LeadTriggerConfiguration = z.infer<typeof leadTriggerFields>;
