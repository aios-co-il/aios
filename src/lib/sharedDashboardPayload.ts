import type { Json } from "@/integrations/supabase/types";
import type { CrmTableIntegrationSettings } from "@/lib/dynamicTableTypes";
import { readIntegrationSettings } from "@/lib/integrationSettingsReader";
import {
  asArray,
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
  toSharedRecord,
  toSharedRecords,
  toSharedSeoMonthly,
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

function toDashboardInfo(value: unknown): SharedDashboardInfo | undefined {
  if (!isJsonObject(value)) return undefined;
  return {
    name: readString(value, "name") ?? "",
    client_id: nullableText(value, "client_id"),
    client_name: nullableText(value, "client_name"),
    agency_name: nullableText(value, "agency_name"),
    settings: value.settings,
  };
}

function toDashboardTables(value: unknown): SharedDashboardTable[] {
  return jsonObjects(value).flatMap((table) =>
    typeof table.id === "string"
      ? [
          {
            id: table.id,
            integration_type: readString(table, "integration_type") ?? null,
            integration_settings: readIntegrationSettings(
              table.integration_settings,
            ),
          },
        ]
      : [],
  );
}

function toDashboardRecords(value: unknown): SharedDashboardRecord[] {
  return jsonObjects(value).flatMap((row) => {
    const { id, data } = toSharedRecord(row);
    if (id === undefined) return [];
    const settings = row._integrationSettings;
    return [
      {
        id,
        data,
        _source: readString(row, "_source"),
        _integrationSettings:
          settings === undefined
            ? undefined
            : readIntegrationSettings(settings),
      },
    ];
  });
}

function toWooCommerce(value: unknown): SharedDashboardPayload["woocommerce"] {
  if (!isJsonObject(value)) return undefined;
  return {
    sites: value.sites === undefined ? undefined : asArray(value.sites),
    orders:
      value.orders === undefined
        ? undefined
        : toWooOrderRows(asArray(value.orders)),
  };
}

/** Narrow a `public-dashboard` response body. */
export function toSharedDashboardPayload(
  value: unknown,
): SharedDashboardPayload {
  const body = asJsonObject(value);
  return {
    error: readString(body, "error"),
    dashboard: toDashboardInfo(body.dashboard),
    tables: present(body.tables, toDashboardTables),
    records: present(body.records, toDashboardRecords),
    woocommerce: toWooCommerce(body.woocommerce),
    ahrefs_reports: present(body.ahrefs_reports, toSeoReportRows),
    seo_ga_records: present(body.seo_ga_records, toSharedRecords),
    seo_gsc_records: present(body.seo_gsc_records, toSharedRecords),
    gsc_multi_period: present(body.gsc_multi_period, toGscMultiPeriod),
    maskyoo_snapshots: present(body.maskyoo_snapshots, toMaskyooSnapshots),
    maskyoo_period: present(body.maskyoo_period, toPeriod),
    seo_monthly: present(body.seo_monthly, toSharedSeoMonthly),
    seo_keyword_relevance: toKeywordRelevance(body.seo_keyword_relevance),
  };
}
