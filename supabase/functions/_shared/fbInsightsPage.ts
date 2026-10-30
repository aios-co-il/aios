import type { FbActionStat, FbInsightRow } from "./fbInsights.ts";
import { z } from "npm:zod@3.25.76";

export interface FbInsightsPage {
  rows: FbInsightRow[];
  next: string | null;
}

/** Any present value as text; null and absent read as "". */
const text = z
  .unknown()
  .transform((value) => (value == null ? "" : String(value)));

/** Any present value as text; null and absent read as undefined. */
const optionalText = z
  .unknown()
  .transform((value) => (value == null ? undefined : String(value)));

/** A row or stat that is not an object reads as all-empty. */
const lenient = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catch(() => z.object(shape).parse({}));

const actionStatSchema = lenient({
  action_type: z.string().optional().catch(undefined),
  value: z.union([z.string(), z.number()]).optional().catch(undefined),
});

const actionStats = z
  .array(z.unknown())
  .transform((stats): FbActionStat[] =>
    stats.map((stat) => actionStatSchema.parse(stat)),
  )
  .optional()
  .catch(undefined);

const fbInsightRowSchema = lenient({
  campaign_id: text,
  campaign_name: text,
  adset_id: optionalText,
  adset_name: optionalText,
  ad_id: optionalText,
  ad_name: optionalText,
  date_start: text,
  spend: text,
  impressions: text,
  reach: text,
  frequency: text,
  clicks: text,
  inline_link_clicks: text,
  cpm: text,
  ctr: text,
  actions: actionStats,
  conversions: actionStats,
  action_values: actionStats,
});

export function readFbInsightRow(value: unknown): FbInsightRow {
  return fbInsightRowSchema.parse(value);
}

const graphErrorSchema = lenient({ message: z.unknown() });

const insightsPageSchema = lenient({
  error: z.unknown(),
  data: z.array(z.unknown()).optional().catch(undefined),
  paging: lenient({ next: z.unknown() }),
});

/** One Graph insights response page; throws the Graph error like the API reports it. */
export function readFbInsightsPage(body: unknown): FbInsightsPage {
  const page = insightsPageSchema.parse(body);
  if (page.error) {
    const { message } = graphErrorSchema.parse(page.error);
    throw new Error(message ? String(message) : JSON.stringify(page.error));
  }
  const next = z.string().min(1).nullable().catch(null).parse(page.paging.next);
  return {
    rows: (page.data ?? []).map(readFbInsightRow),
    next,
  };
}
