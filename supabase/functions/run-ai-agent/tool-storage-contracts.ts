import { normalizeMetaAdAccountId } from "../_shared/client-report-sync.ts";
import { z } from "npm:zod@3.25.76";

const optionalText = z.string().nullish().catch(invalidStoredField);
const marketingWorkItemPayloadSchema = z
  .object({
    department: optionalText,
    brief_text: optionalText,
  })
  .catch(emptyStoredObject);
const automationStepSummarySchema = z
  .object({
    skin_slugs: z.array(z.string()).nullish().catch(invalidStoredField),
    step_instruction: optionalText,
    agent_id: optionalText,
    facebook_form_id: optionalText,
    facebook_form_name: optionalText,
    facebook_page_id: optionalText,
    facebook_page_name: optionalText,
    facebook_integration_id: optionalText,
  })
  .catch(emptyStoredObject);
const metaAdSettingsSchema = z
  .object({
    ad_account_id: z
      .union([
        z.string(),
        z.number(),
        z.tuple([z.union([z.string(), z.number()])]).transform(([id]) => id),
      ])
      .optional()
      .catch(invalidStoredField),
  })
  .catch(emptyStoredObject);

export type MetaAdSettings = z.infer<typeof metaAdSettingsSchema>;

/** Read only the marketing fields consumed by list and stage tools. */
export function readMarketingWorkItemPayload(value: unknown) {
  return marketingWorkItemPayloadSchema.parse(value);
}

/** Read summary fields without requiring every stored automation setting. */
export function readAutomationStepSummary(value: unknown) {
  return automationStepSummarySchema.parse(value);
}

/** Validate the stored Meta identifier for account health displays. */
export function readMetaAdSettings(value: unknown): MetaAdSettings {
  return metaAdSettingsSchema.parse(value);
}

/** Record rejected field paths without exposing stored values or credentials. */
function invalidStoredField(context: { error: z.ZodError }): undefined {
  console.warn(
    "[tools] Invalid stored fields",
    context.error.issues.map((issue) => issue.path),
  );
  return undefined;
}

/** Keep malformed roots out of domain readers while recording the rejection. */
function emptyStoredObject(context: { error: z.ZodError }) {
  invalidStoredField(context);
  return {};
}

/** Mutation checks must retain the legacy bindings still used by report synchronization. */
export function readMetaAdAccountBinding(value: unknown): string | null {
  if (
    value === null ||
    typeof value !== "object" ||
    !("ad_account_id" in value)
  ) {
    return null;
  }
  return normalizeMetaAdAccountId(value.ad_account_id);
}
