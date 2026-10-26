import type { Json, Tables } from "@/integrations/supabase/types";
import { asJsonObject, type JsonObject } from "@/lib/jsonReaders";

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

export function toLangFilter(value: unknown): LangFilterValue {
  return value === "he" || value === "en" ? value : "all";
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

function settingText(value: Json | undefined): SettingText | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function settingId(value: Json | undefined): SettingId | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    value === null
    ? value
    : undefined;
}

export function readMakeApiSettings(
  value: Json | null | undefined,
): MakeApiSettings {
  const settings = asJsonObject(value);
  return {
    api_token: settingText(settings.api_token),
    team_id: settingId(settings.team_id),
    region: settingText(settings.region),
    google_ads_template_scenario_id: settingId(
      settings.google_ads_template_scenario_id,
    ),
  };
}
