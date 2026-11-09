import { z } from "npm:zod@3.25.76";
import { isMetaNode, type MetaNode } from "./meta-response.ts";
import { invalidToolInput } from "./tool-input-errors.ts";

/** Keep unowned integration and mapping keys while exposing validated domain fields. */
export function readMetaLeadSettings(value: unknown): MetaLeadSettings {
  const parsed = metaLeadSettingsFields.passthrough().safeParse(value ?? {});
  if (!parsed.success) {
    throw invalidToolInput("Meta lead settings", parsed.error);
  }
  return parsed.data;
}

export type ConfiguredMetaPage = Pick<MetaNode, "id" | "name" | "access_token">;

const formMappingFields = z.object({
  field_mappings: z.record(z.string()).nullish(),
  agency_id: z.string().nullish(),
  client_id: z.string().nullish(),
  sales_person_id: z.string().nullish(),
  sales_person_ids: z.array(z.string()).nullish(),
  tag_id: z.string().nullish(),
  create_crm_lead: z.boolean().nullish(),
  form_name: z.string().nullish(),
  page_id: z.string().nullish(),
  page_name: z.string().nullish(),
});
export type MetaFormMapping = z.infer<typeof formMappingFields>;
const formMappingSchema: z.ZodType<MetaFormMapping> =
  formMappingFields.passthrough();
const metaLeadSettingsFields = z.object({
  pages: z
    .array(z.unknown())
    .transform((pages): Array<ConfiguredMetaPage> =>
      pages.filter((page): page is MetaNode => {
        if (isMetaNode(page)) {
          return true;
        }
        console.warn("[Meta lead settings] Invalid configured page");
        return false;
      }),
    )
    .nullish(),
  form_mappings: z.record(formMappingSchema).nullish(),
});
export type MetaLeadSettings = z.infer<typeof metaLeadSettingsFields>;
