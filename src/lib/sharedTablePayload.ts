import type { ComponentProps } from "react";
import type { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";
import type { PublicSeoMonthlyWorkView } from "@/components/dynamic-tables/PublicSeoMonthlyWorkView";
import type { PublicMaskyooCallsCard } from "@/components/dynamic-tables/PublicMaskyooCallsCard";
import type { CrmTableIntegrationSettings } from "@/lib/dynamicTableTypes";
import { readIntegrationSettings } from "@/lib/integrationSettingsReader";
import {
  asJsonObject,
  isJsonObject,
  jsonObjects,
  readString,
  type JsonObject,
} from "@/lib/jsonReaders";
import {
  nullableText,
  present,
  toGscMultiPeriod,
  toKeywordRelevance,
  toMaskyooSnapshots,
  toPeriod,
  toSeoReportRows,
  toSharedRecords,
  toSharedSeoMonthly,
} from "@/lib/sharedPayloadReaders";

type PublicSeoProps = ComponentProps<typeof PublicSeoView>;
type MonthlyWorkProps = ComponentProps<typeof PublicSeoMonthlyWorkView>;

export interface SharedTableRecord {
  id?: string;
  data: JsonObject;
}

export interface SharedTableField {
  field_key?: string;
  field_label?: string;
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

function toSharedTableInfo(value: unknown): SharedTableInfo | undefined {
  if (!isJsonObject(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    name: readString(value, "name") ?? "",
    agency_name: nullableText(value, "agency_name"),
    integration_type: readString(value, "integration_type") ?? null,
    integration_settings: readIntegrationSettings(value.integration_settings),
    client_id: nullableText(value, "client_id"),
  };
}

function toSharedTableFields(value: unknown): SharedTableField[] {
  return jsonObjects(value).map((field) => ({
    field_key: readString(field, "field_key"),
    field_label: readString(field, "field_label"),
  }));
}

/** Narrow a `public-table` response body. */
export function toSharedTablePayload(value: unknown): SharedTablePayload {
  const body = asJsonObject(value);
  return {
    error: readString(body, "error"),
    table: toSharedTableInfo(body.table),
    records: present(body.records, toSharedRecords),
    fields: present(body.fields, toSharedTableFields),
    ga_records: present(body.ga_records, toSharedRecords),
    gsc_records: present(body.gsc_records, toSharedRecords),
    gsc_multi_period: present(body.gsc_multi_period, toGscMultiPeriod),
    gsc_synced_at: nullableText(body, "gsc_synced_at"),
    maskyoo_snapshots: present(body.maskyoo_snapshots, toMaskyooSnapshots),
    maskyoo_period: present(body.maskyoo_period, toPeriod),
    seo_monthly: present(body.seo_monthly, toSharedSeoMonthly),
    seo_keyword_relevance: toKeywordRelevance(body.seo_keyword_relevance),
    ahrefs_reports: present(body.ahrefs_reports, toSeoReportRows),
  };
}
