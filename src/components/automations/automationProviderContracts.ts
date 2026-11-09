import { z } from "zod";
const text = z.string().optional().catch(undefined);
const integrationSchema = z
  .object({
    instance_name: text,
    connection_name: text,
    display_name: text,
    phone_number: text,
    display_phone_number: text,
    instance_id: text,
  })
  .catch({});
/** The labels used when choosing an automation's sending connection. */
export function readAutomationIntegrationSettings(value: unknown) {
  return integrationSchema.parse(value);
}
const templateSchema = z.object({
  name: z.string(),
  language: text,
  status: text,
});
const templatesSchema = z
  .object({
    error: text,
    templates: z.array(templateSchema).optional().catch(undefined),
    data: z.array(templateSchema).optional().catch(undefined),
  })
  .catch({});
/** Template response fields displayed by the Meta WhatsApp action editor. */
export function readMetaTemplates(value: unknown) {
  return templatesSchema.parse(value);
}

const responseSchema = z.object({ statusText: text }).catch({});
/** Status label consumed from an automation execution log. */
export function readAutomationResponse(value: unknown) {
  return responseSchema.parse(value);
}
