import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type { CrmTableIntegrationSettings } from "@/lib/dynamicTableTypes";
import { integrationSettingsSchema } from "@/lib/integrationSettingsReader";
import {
  jsonObjectSchema,
  jsonValueSchema,
  listOf,
  type JsonObject,
} from "@/lib/jsonReaders";
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
import type {
  SharedKeywordRelevance,
  SharedSeoMonthly,
  SharedTablePayload,
  SharedTableRecord,
} from "@/lib/sharedTablePayload";
import { toWooOrderRows, type WooOrderRow } from "@/lib/wooOrderRows";

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
    sites?: unknown[];
    orders?: WooOrderRow[];
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

const dashboardInfoSchema = z
  .object({
    name: z.string().catch(""),
    client_id: optionalText,
    client_name: optionalText,
    agency_name: optionalText,
    settings: jsonValueSchema.optional(),
  })
  .optional()
  .catch(undefined);

const dashboardTableList = listOf(
  z.object({
    id: z.string(),
    integration_type: z.string().nullable().catch(null),
    integration_settings: integrationSettingsSchema,
  }),
);

const dashboardRecordList = listOf(
  z.object({
    id: z.string(),
    data: jsonObjectSchema.catch({}),
    _source: optionalString,
    _integrationSettings: integrationSettingsSchema.optional(),
  }),
);

const unknownList = z.array(z.unknown()).catch([]);

const wooCommerceSchema = z
  .object({
    sites: unknownList.optional(),
    orders: unknownList.transform(toWooOrderRows).optional(),
  })
  .optional()
  .catch(undefined);

const sharedDashboardBodySchema = objectBody.pipe(
  z.object({
    error: optionalString,
    dashboard: dashboardInfoSchema,
    tables: dashboardTableList.optional(),
    records: dashboardRecordList.optional(),
    woocommerce: wooCommerceSchema,
    ahrefs_reports: seoReportRowList.optional(),
    seo_ga_records: sharedRecordList.optional(),
    seo_gsc_records: sharedRecordList.optional(),
    gsc_multi_period: gscMultiPeriodSchema.optional(),
    maskyoo_snapshots: maskyooSnapshotList.optional(),
    maskyoo_period: periodSchema.optional(),
    seo_monthly: sharedSeoMonthlySchema.optional(),
    seo_keyword_relevance: keywordRelevanceSchema,
  }),
);

/** Narrow a `public-dashboard` response body. */
export function toSharedDashboardPayload(
  value: unknown,
): SharedDashboardPayload {
  return sharedDashboardBodySchema.parse(value);
}
