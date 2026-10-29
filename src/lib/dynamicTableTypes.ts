import { z } from "zod";
import type { Json, Tables } from "@/integrations/supabase/types";
import type { JsonObject } from "@/lib/jsonReaders";

export type CrmTableRow = Tables<"crm_tables">;

export type SeoReportRecord = Partial<
  Pick<
    Tables<"ahrefs_reports">,
    | "id"
    | "client_id"
    | "domain"
    | "received_at"
    | "report_date"
    | "report_type"
    | "report_data"
    | "comparison_data"
    | "metadata"
  >
>;

export type SeoReportRow = Pick<
  Tables<"ahrefs_reports">,
  "id" | "domain" | "received_at" | "report_date" | "report_data"
> &
  SeoReportRecord;

export interface DynamicRecord {
  id?: string;
  data?: JsonObject | null;
}

export type LangFilterValue = "all" | "he" | "en";

const langFilterSchema = z.enum(["all", "he", "en"]).catch("all");

export function toLangFilter(value: unknown): LangFilterValue {
  return langFilterSchema.parse(value);
}

type SettingText = string | null;
type SettingId = string | number | null;

export type ManualRoiSettings = {
  closures?: number | null;
  revenue?: number | null;
};

export type CrmTableIntegrationSettings = {
  ad_account_id?: SettingText;
  ad_account_name?: SettingText;
  ahrefs_mode?: SettingText;
  ahrefs_project_id?: SettingId;
  ahrefs_protocol?: SettingText;
  campaign_type?: SettingText;
  clientId?: SettingText;
  client_id?: SettingText;
  country?: SettingText;
  currency?: SettingText;
  customer_id?: SettingText;
  data_source?: SettingText;
  date_range?: SettingText;
  default_report_mode?: SettingText;
  domain?: SettingText;
  google_ads_customer_id?: SettingText;
  last_sync_at?: SettingText;
  linkedGscLangFilter?: SettingText;
  make_connection_id?: SettingId;
  make_scenario_id?: SettingId;
  manual_roi?: ManualRoiSettings | null;
  maskyoo_number?: SettingText;
  reportType?: SettingText;
  target?: SettingText;
  targetDomain?: SettingText;
  use_woo_google_attribution?: boolean;
  webhook_secret?: SettingText;
};

export type MakeApiSettings = {
  api_token?: SettingText;
  team_id?: SettingId;
  region?: SettingText;
  google_ads_template_scenario_id?: SettingId;
};

const settingText = z.string().nullable().optional().catch(undefined);

const settingId = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .catch(undefined);

const makeApiSettingsSchema = z
  .object({
    api_token: settingText,
    team_id: settingId,
    region: settingText,
    google_ads_template_scenario_id: settingId,
  })
  .catch({});

export function readMakeApiSettings(
  value: Json | null | undefined,
): MakeApiSettings {
  return makeApiSettingsSchema.parse(value);
}
