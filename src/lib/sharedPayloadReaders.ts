import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { jsonObjectSchema, jsonValueSchema, listOf } from "@/lib/jsonReaders";

/** Text or null; any other value reads as absent. */
export const optionalText = z.string().nullable().optional().catch(undefined);

/** Text; any other value reads as absent. */
export const optionalString = z.string().optional().catch(undefined);

const textOrNull = z.string().nullable().catch(null);

/** A public share record; GSC rows built from the live API have no id. */
export const sharedRecordSchema = z.object({
  id: optionalString,
  data: jsonObjectSchema.catch({}),
});

export const sharedRecordList = listOf(sharedRecordSchema);

const seoReportRowSchema = z.object({
  id: z.string(),
  domain: z.string(),
  received_at: z.string(),
  report_date: textOrNull,
  report_data: z.custom<Json>((value) => value !== undefined),
  report_type: optionalString,
  comparison_data: jsonValueSchema.optional(),
  metadata: jsonValueSchema.optional(),
});

export const seoReportRowList = listOf(seoReportRowSchema);

const gscKeywordList = listOf(
  z.object({
    keyword: z.string(),
    clicks: z.number(),
    impressions: z.number(),
    ctr: z.number(),
    position: z.number(),
  }),
);

export const gscMultiPeriodSchema = z
  .object({
    prevMonth: gscKeywordList,
    threeMonth: gscKeywordList,
    yearly: gscKeywordList,
  })
  .nullable()
  .catch(null);

export const maskyooSnapshotList = listOf(
  z.object({
    category: z.string(),
    incoming_count: z.number(),
    is_manual: z.unknown().transform((value) => value === true),
  }),
);

export const periodSchema = z
  .object({ start: z.string(), end: z.string() })
  .nullable()
  .catch(null);

const monthlyRowList = listOf(
  z.object({
    month: z.string(),
    status: z.string(),
    work: jsonValueSchema,
    notes: optionalText,
    share_token: optionalText,
    snapshot: jsonValueSchema.optional(),
  }),
);

export const sharedSeoMonthlySchema = z
  .object({
    months: monthlyRowList,
    client_name: optionalText,
    domain: optionalText,
    share_token: optionalText,
  })
  .nullable()
  .catch(null);

const stringList = z
  .array(z.unknown())
  .transform((items) =>
    items.filter((item): item is string => typeof item === "string"),
  )
  .optional()
  .catch(undefined);

export const keywordRelevanceSchema = z
  .object({ force_relevant: stringList, force_irrelevant: stringList })
  .optional()
  .catch(undefined);

/** A body as an object; anything else reads as `{}`. */
export const objectBody = z.record(z.unknown()).catch({});
