import type { ComponentProps } from "react";
import type { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";
import type { PublicSeoMonthlyWorkView } from "@/components/dynamic-tables/PublicSeoMonthlyWorkView";
import type { PublicMaskyooCallsCard } from "@/components/dynamic-tables/PublicMaskyooCallsCard";
import type {
  CrmTableIntegrationSettings,
  JsonObject,
} from "@/lib/dynamic-tables-b19";

type PublicSeoProps = ComponentProps<typeof PublicSeoView>;
type MonthlyWorkProps = ComponentProps<typeof PublicSeoMonthlyWorkView>;

export interface SharedTableRecord {
  id: string;
  data: JsonObject;
}

export interface SharedTableField {
  field_key: string;
  field_label: string;
}

export interface SharedTableInfo {
  id: string;
  name: string;
  agency_name?: string | null;
  integration_type: string | null;
  integration_settings: CrmTableIntegrationSettings | null;
  client_id?: string | null;
}

export interface SharedSeoMonthly {
  months?: MonthlyWorkProps["months"];
  client_name?: string | null;
  domain?: string | null;
  share_token?: string | null;
}

export interface SharedKeywordRelevance {
  force_relevant?: string[];
  force_irrelevant?: string[];
}

export interface SharedTablePayload {
  error?: string;
  table?: SharedTableInfo;
  records?: SharedTableRecord[];
  fields?: SharedTableField[];
  ga_records?: SharedTableRecord[];
  gsc_records?: SharedTableRecord[];
  gsc_multi_period?: PublicSeoProps["gscMultiPeriod"] | null;
  gsc_synced_at?: string | null;
  maskyoo_snapshots?: ComponentProps<
    typeof PublicMaskyooCallsCard
  >["snapshots"];
  maskyoo_period?: { start: string; end: string } | null;
  seo_monthly?: SharedSeoMonthly | null;
  seo_keyword_relevance?: SharedKeywordRelevance;
  ahrefs_reports?: PublicSeoProps["reports"];
}
