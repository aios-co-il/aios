import { z } from "npm:zod@3.25.76";
import type { ReportInsightRequest } from "./types.ts";

/** Most campaigns a scope may carry, so one request stays a short prompt. */
export const MAX_CAMPAIGNS = 15;

const count = z.number().finite().min(0);

const figures = z.object({
  spend: count,
  impressions: count,
  clicks: count,
  leads: count,
  purchases: count,
  revenue: count,
  sessions: count.nullable(),
});

const scope = z.object({
  scope: z.enum(["all", "ecommerce", "leads", "traffic"]),
  figures,
  previous: figures.nullable(),
  campaigns: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        channel: z.enum(["facebook", "google_ads"]),
        on: z.boolean().nullable(),
        figures,
      }),
    )
    .max(MAX_CAMPAIGNS),
});

export const reportInsightRequest: z.ZodType<ReportInsightRequest> = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  scopes: z.array(scope).min(1).max(4),
});
