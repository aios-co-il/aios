import type { Json } from "@/integrations/supabase/types";
import type {
  CrmTableIntegrationSettings,
  ManualRoiSettings,
} from "@/lib/dynamicTableTypes";
import { isJsonObject } from "@/lib/jsonReaders";

type SettingText = string | null | undefined;
type SettingId = string | number | null | undefined;

const text = (value: Json | undefined): SettingText =>
  typeof value === "string" || value === null ? value : undefined;

const id = (value: Json | undefined): SettingId =>
  typeof value === "number" ? value : text(value);

const numberOrNull = (value: Json | undefined): number | null | undefined =>
  typeof value === "number" || value === null ? value : undefined;

function readManualRoi(value: Json | undefined): ManualRoiSettings | null {
  if (!isJsonObject(value)) return null;
  return {
    closures: numberOrNull(value.closures),
    revenue: numberOrNull(value.revenue),
  };
}

/** `crm_tables.integration_settings`; known keys are narrowed, others pass through. */
export function readIntegrationSettings(
  value: unknown,
): CrmTableIntegrationSettings | null {
  if (!isJsonObject(value)) return null;
  const woo = value.use_woo_google_attribution;
  return {
    ...value,
    ad_account_id: text(value.ad_account_id),
    ad_account_name: text(value.ad_account_name),
    ahrefs_mode: text(value.ahrefs_mode),
    ahrefs_project_id: id(value.ahrefs_project_id),
    ahrefs_protocol: text(value.ahrefs_protocol),
    campaign_type: text(value.campaign_type),
    clientId: text(value.clientId),
    client_id: text(value.client_id),
    country: text(value.country),
    currency: text(value.currency),
    customer_id: text(value.customer_id),
    data_source: text(value.data_source),
    date_range: text(value.date_range),
    default_report_mode: text(value.default_report_mode),
    domain: text(value.domain),
    google_ads_customer_id: text(value.google_ads_customer_id),
    last_sync_at: text(value.last_sync_at),
    linkedGscLangFilter: text(value.linkedGscLangFilter),
    make_connection_id: id(value.make_connection_id),
    make_scenario_id: id(value.make_scenario_id),
    manual_roi:
      value.manual_roi === undefined
        ? undefined
        : readManualRoi(value.manual_roi),
    maskyoo_number: text(value.maskyoo_number),
    reportType: text(value.reportType),
    target: text(value.target),
    targetDomain: text(value.targetDomain),
    use_woo_google_attribution: typeof woo === "boolean" ? woo : undefined,
    webhook_secret: text(value.webhook_secret),
  };
}
