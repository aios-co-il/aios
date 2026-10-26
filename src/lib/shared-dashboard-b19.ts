import type { ComponentProps } from "react";
import type { Json } from "@/integrations/supabase/types";
import type { PublicWooCommerceView } from "@/components/dynamic-tables/PublicWooCommerceView";
import type { WooOrderRevenueRow } from "@/lib/wooOrderRevenue";
import type {
  CrmTableIntegrationSettings,
  JsonObject,
} from "@/lib/dynamic-tables-b19";
import type {
  SharedKeywordRelevance,
  SharedSeoMonthly,
  SharedTablePayload,
  SharedTableRecord,
} from "@/lib/shared-table-b19";

export interface SharedDashboardInfo {
  name: string;
  client_id?: string | null;
  client_name?: string | null;
  agency_name?: string | null;
  settings?: Json | null;
}

export interface SharedDashboardTable {
  id: string;
  integration_type: string | null;
  integration_settings: CrmTableIntegrationSettings | null;
}

export interface SharedDashboardRecord {
  id: string;
  data: JsonObject;
  _source?: string;
  _integrationSettings?: CrmTableIntegrationSettings | null;
}

export interface SharedDashboardPayload {
  error?: string;
  dashboard?: SharedDashboardInfo;
  tables?: SharedDashboardTable[];
  records?: SharedDashboardRecord[];
  woocommerce?: {
    sites?: ComponentProps<typeof PublicWooCommerceView>["sites"];
    orders?: WooOrderRevenueRow[];
  };
  ahrefs_reports?: SharedTablePayload["ahrefs_reports"];
  seo_ga_records?: SharedTableRecord[];
  seo_gsc_records?: SharedTableRecord[];
  gsc_multi_period?: SharedTablePayload["gsc_multi_period"];
  maskyoo_snapshots?: SharedTablePayload["maskyoo_snapshots"];
  maskyoo_period?: { start: string; end: string } | null;
  seo_monthly?: SharedSeoMonthly | null;
  seo_keyword_relevance?: SharedKeywordRelevance;
}
