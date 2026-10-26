import type { Json } from "@/integrations/supabase/types";
import type { SeoReportRow } from "@/lib/dynamicTableTypes";
import {
  asJsonObject,
  isJsonObject,
  jsonObjects,
  readString,
  type JsonObject,
} from "@/lib/jsonReaders";

const textOrNull = (value: Json | undefined): string | null =>
  typeof value === "string" ? value : null;

export const nullableText = (obj: JsonObject, key: string) =>
  obj[key] === null ? null : readString(obj, key);

export const present = <T>(raw: unknown, read: (value: unknown) => T) =>
  raw === undefined ? undefined : read(raw);

const optionalText = (value: Json | undefined): string | null | undefined =>
  typeof value === "string" || value === null ? value : undefined;

/** A public share record; GSC rows built from the live API have no id. */
export function toSharedRecord(row: JsonObject): {
  id?: string;
  data: JsonObject;
} {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    data: asJsonObject(row.data),
  };
}

export function toSharedRecords(value: unknown) {
  return jsonObjects(value).map(toSharedRecord);
}

export function toSeoReportRows(value: unknown): SeoReportRow[] {
  return jsonObjects(value).flatMap((row) =>
    typeof row.id === "string" &&
    typeof row.domain === "string" &&
    typeof row.received_at === "string" &&
    row.report_data !== undefined
      ? [
          {
            id: row.id,
            domain: row.domain,
            received_at: row.received_at,
            report_date: textOrNull(row.report_date),
            report_data: row.report_data,
            report_type: optionalText(row.report_type) ?? undefined,
            comparison_data: row.comparison_data,
            metadata: row.metadata,
          },
        ]
      : [],
  );
}

function toGscKeywords(value: Json | undefined) {
  return jsonObjects(value).flatMap((row) => {
    const { keyword, clicks, impressions, ctr, position } = row;
    return typeof keyword === "string" &&
      typeof clicks === "number" &&
      typeof impressions === "number" &&
      typeof ctr === "number" &&
      typeof position === "number"
      ? [{ keyword, clicks, impressions, ctr, position }]
      : [];
  });
}

export function toGscMultiPeriod(value: unknown) {
  if (!isJsonObject(value)) return null;
  return {
    prevMonth: toGscKeywords(value.prevMonth),
    threeMonth: toGscKeywords(value.threeMonth),
    yearly: toGscKeywords(value.yearly),
  };
}

export function toMaskyooSnapshots(value: unknown) {
  return jsonObjects(value).flatMap((row) =>
    typeof row.category === "string" && typeof row.incoming_count === "number"
      ? [
          {
            category: row.category,
            incoming_count: row.incoming_count,
            is_manual: row.is_manual === true,
          },
        ]
      : [],
  );
}

export function toPeriod(value: unknown) {
  if (!isJsonObject(value)) return null;
  const { start, end } = value;
  return typeof start === "string" && typeof end === "string"
    ? { start, end }
    : null;
}

function toMonthlyRows(value: Json | undefined) {
  return jsonObjects(value).flatMap((row) =>
    typeof row.month === "string" && typeof row.status === "string"
      ? [
          {
            month: row.month,
            status: row.status,
            work: row.work,
            notes: optionalText(row.notes),
            share_token: optionalText(row.share_token),
            snapshot: row.snapshot,
          },
        ]
      : [],
  );
}

export function toSharedSeoMonthly(value: unknown) {
  if (!isJsonObject(value)) return null;
  return {
    months: toMonthlyRows(value.months),
    client_name: optionalText(value.client_name),
    domain: optionalText(value.domain),
    share_token: optionalText(value.share_token),
  };
}

const stringList = (value: Json | undefined): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;

export function toKeywordRelevance(value: unknown) {
  if (!isJsonObject(value)) return undefined;
  return {
    force_relevant: stringList(value.force_relevant),
    force_irrelevant: stringList(value.force_irrelevant),
  };
}
