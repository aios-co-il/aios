import { z } from "zod";

const optionalString = z.string().nullable().optional().catch(undefined);
const optionalBoolean = z.boolean().nullable().optional().catch(undefined);

/** The JSON settings column; integration-specific keys (e.g. SEO targets) pass through untouched. */
const crmTableIntegrationSettingsSchema = z
  .object({
    ad_account_id: optionalString,
    customer_id: optionalString,
    last_sync_at: optionalString,
  })
  .passthrough();

export type CrmTableIntegrationSettings = z.infer<
  typeof crmTableIntegrationSettingsSchema
>;

/** A `crm_tables` row as returned by the `crm-tables` edge function list; optional fields of an unexpected type become `undefined`. */
export const crmTableSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  client_id: optionalString,
  tenant_id: optionalString,
  integration_type: optionalString,
  integration_settings: crmTableIntegrationSettingsSchema
    .nullable()
    .optional()
    .catch(null),
  campaign_active: optionalBoolean,
  last_sync_at: optionalString,
});

export type CrmTableSummary = z.infer<typeof crmTableSummarySchema>;

/** The table list from a `crm-tables` GET response; only rows without a string `id`, `name` or `slug` are dropped. */
export function parseCrmTableList(data: unknown): CrmTableSummary[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = crmTableSummarySchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
