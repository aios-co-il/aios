import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";
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

/** Validate configured pages only when reading them for Meta requests. */
export function configuredPages(
  settings: MetaLeadSettings,
): Array<ConfiguredMetaPage> {
  const pages: Array<ConfiguredMetaPage> = [];
  for (const page of settings.pages ?? []) {
    if (isMetaNode(page)) {
      pages.push(page);
    } else {
      console.warn("[Meta lead settings] Invalid configured page");
    }
  }
  return pages;
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
// Persisted pages round-trip even when their known Meta fields are invalid.
const storedPageValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(storedPageValue),
    z.record(storedPageValue.optional()),
  ]),
);

const metaLeadSettingsFields = z.object({
  pages: z.array(storedPageValue).nullish(),
  form_mappings: z.record(formMappingSchema).nullish(),
});
export type MetaLeadSettings = z.infer<typeof metaLeadSettingsFields>;
