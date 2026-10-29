import { z } from "zod";
import type { CrmTableIntegrationSettings } from "@/lib/dynamicTableTypes";

const text = z.string().nullable().optional().catch(undefined);

const id = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .catch(undefined);

const numberOrNull = z.number().nullable().optional().catch(undefined);

const manualRoiSchema = z
  .object({ closures: numberOrNull, revenue: numberOrNull })
  .nullable()
  .catch(null)
  .optional();

/** Known keys are narrowed (a wrong type reads as absent); others pass through. */
export const integrationSettingsSchema = z
  .object({
    ad_account_id: text,
    ad_account_name: text,
    ahrefs_mode: text,
    ahrefs_project_id: id,
    ahrefs_protocol: text,
    campaign_type: text,
    clientId: text,
    client_id: text,
    country: text,
    currency: text,
    customer_id: text,
    data_source: text,
    date_range: text,
    default_report_mode: text,
    domain: text,
    google_ads_customer_id: text,
    last_sync_at: text,
    linkedGscLangFilter: text,
    make_connection_id: id,
    make_scenario_id: id,
    manual_roi: manualRoiSchema,
    maskyoo_number: text,
    reportType: text,
    target: text,
    targetDomain: text,
    use_woo_google_attribution: z.boolean().optional().catch(undefined),
    webhook_secret: text,
  })
  .passthrough()
  .nullable()
  .catch(null);

/** `crm_tables.integration_settings`; anything but an object reads as null. */
export function readIntegrationSettings(
  value: unknown,
): CrmTableIntegrationSettings | null {
  return integrationSettingsSchema.parse(value);
}
