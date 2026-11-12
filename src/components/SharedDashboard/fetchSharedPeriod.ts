import { z } from "zod";
import type { CalendarRange } from "@/components/report-ui/dashboard/previousPeriod";

const recordSchema = z
  .object({
    _tableId: z.string().optional(),
    _source: z.string().optional(),
    data: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

const wooOrderSchema = z
  .object({
    id: z.string().optional(),
    total: z.union([z.number(), z.string()]).nullable().optional(),
    status: z.string().nullable().optional(),
    date_created: z.string().nullable().optional(),
    date_completed: z.string().nullable().optional(),
    date_paid: z.string().nullable().optional(),
  })
  .passthrough();

/** The parts of a public-dashboard answer a compared period reads. */
const sharedPeriodSchema = z.object({
  records: z.array(recordSchema).default([]),
  woocommerce: z
    .object({ orders: z.array(wooOrderSchema).default([]) })
    .default({ orders: [] }),
});

export type SharedPeriod = z.infer<typeof sharedPeriodSchema>;

/**
 * The share link's records and store orders in a calendar window, read from
 * public-dashboard with `custom_start` / `custom_end`. An anonymous viewer
 * cannot read crm_records, so the link's own endpoint serves the window.
 */
export async function fetchSharedPeriod(
  shareToken: string,
  range: CalendarRange,
): Promise<SharedPeriod> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !apiKey) {
    throw new Error(
      "חסרה הגדרת Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  const query = new URLSearchParams({
    token: shareToken,
    custom_start: range.startDate,
    custom_end: range.endDate,
  });
  // A GET with query parameters, as the page's own read; the function reads
  // no body, so supabase.functions.invoke would add nothing here.
  const res = await fetch(
    `${supabaseUrl}/functions/v1/public-dashboard?${query}`,
    { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) {
    throw new Error(
      (await res.text()) || `public-dashboard failed (${res.status})`,
    );
  }
  return sharedPeriodSchema.parse(await res.json());
}
