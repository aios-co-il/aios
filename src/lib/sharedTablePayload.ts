import type { ComponentProps } from "react";
import { z } from "zod";
import type { PublicSeoView } from "@/components/dynamic-tables/PublicSeoView";
import type { PublicSeoMonthlyWorkView } from "@/components/dynamic-tables/PublicSeoMonthlyWorkView";
import type { PublicMaskyooCallsCard } from "@/components/dynamic-tables/PublicMaskyooCallsCard";
import type { CrmTableIntegrationSettings } from "@/lib/dynamicTableTypes";
import { integrationSettingsSchema } from "@/lib/integrationSettingsReader";
import { listOf, type JsonObject } from "@/lib/jsonReaders";
import {
  gscMultiPeriodSchema,
  keywordRelevanceSchema,
  maskyooSnapshotList,
  objectBody,
  optionalString,
  optionalText,
  periodSchema,
  seoReportRowList,
  sharedRecordList,
  sharedSeoMonthlySchema,
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

const sharedTableInfoSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    agency_name: optionalText,
    integration_type: z.string().nullable().catch(null),
    integration_settings: integrationSettingsSchema,
    client_id: optionalText,
  })
  .optional()
  .catch(undefined);

const sharedTableFieldList = listOf(
  z.object({ field_key: optionalString, field_label: optionalString }),
);

const sharedTableBodySchema = objectBody.pipe(
  z.object({
    error: optionalString,
    table: sharedTableInfoSchema,
    records: sharedRecordList.optional(),
    fields: sharedTableFieldList.optional(),
    ga_records: sharedRecordList.optional(),
    gsc_records: sharedRecordList.optional(),
    gsc_multi_period: gscMultiPeriodSchema.optional(),
    gsc_synced_at: optionalText,
    maskyoo_snapshots: maskyooSnapshotList.optional(),
    maskyoo_period: periodSchema.optional(),
    seo_monthly: sharedSeoMonthlySchema.optional(),
    seo_keyword_relevance: keywordRelevanceSchema,
    ahrefs_reports: seoReportRowList.optional(),
  }),
);

/** Narrow a `public-table` response body. */
export function toSharedTablePayload(value: unknown): SharedTablePayload {
  return sharedTableBodySchema.parse(value);
}
