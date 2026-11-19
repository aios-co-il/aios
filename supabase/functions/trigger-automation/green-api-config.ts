import { z } from "npm:zod@3.25.76";
const text = z.string().nullish();
const identifier = z.union([z.string(), z.number().finite()]).nullish();
const recipient = z.object({
  type: z.string(),
  field: text,
  phone: identifier,
  group_id: identifier,
  id: identifier,
  entity: text,
});
const greenApiConfig = z.object({
  message_template: text,
  send_to_type: text,
  manual_phone: text,
  manual_group_id: text,
  phone_mode: text,
  green_api_mode: text,
  external_instance_id: text,
  external_api_token: text,
  phone_field: text,
  group_id_field: text,
  integration_id: text,
  green_api_integration_id: text,
  media_type: text,
  media_url: text,
  media_mime_type: text,
  media_filename: text,
  recipients: z
    .array(z.unknown())
    .transform((entries) =>
      entries.map((entry, index) => {
        const parsed = recipient.safeParse(entry);
        if (parsed.success) {
          return parsed.data;
        }
        console.warn("[automation] skipped invalid recipient", { index });
        return null;
      }),
    )
    .nullish(),
});
/** Validate known WhatsApp action settings before recipient resolution or sending. */
export function readGreenApiConfig(value: unknown) {
  return greenApiConfig.parse(value);
}
