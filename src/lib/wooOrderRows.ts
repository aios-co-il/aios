import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type { WooOrderAttribution } from "@/lib/wooAttribution";
import { jsonValueSchema, parseEach } from "@/lib/jsonReaders";

/** A `woocommerce_orders` row as selected by the Woo dashboards (any column subset). */
export type WooOrderRow = {
  id?: string;
  total: number | string | null;
  status: string | null;
  date_created: string | null;
  date_completed: string | null;
  date_paid: string | null;
  attribution: WooOrderAttribution | null;
  customer_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  order_number: string | null;
  currency: string | null;
  line_items: Json;
};

const textOrNull = z.string().nullable().catch(null);

/** `woocommerce_orders.attribution` is jsonb written by the Woo sync. */
const wooOrderAttributionSchema = z
  .object({
    source_type: textOrNull,
    utm_source: textOrNull,
    utm_medium: textOrNull,
    utm_campaign: textOrNull,
    utm_content: textOrNull,
    utm_term: textOrNull,
    referrer: textOrNull,
    session_entry: textOrNull,
    device_type: textOrNull,
    label: z.string().catch(""),
  })
  .nullable()
  .catch(null);

export function toWooOrderAttribution(
  value: Json | undefined,
): WooOrderAttribution | null {
  return wooOrderAttributionSchema.parse(value);
}

/** Columns that were not selected read as null. */
const wooOrderRowSchema = z.object({
  id: z.string().optional().catch(undefined),
  total: z.union([z.number(), z.string()]).nullable().catch(null),
  status: textOrNull,
  date_created: textOrNull,
  date_completed: textOrNull,
  date_paid: textOrNull,
  attribution: wooOrderAttributionSchema,
  customer_email: textOrNull,
  customer_first_name: textOrNull,
  customer_last_name: textOrNull,
  order_number: textOrNull,
  currency: textOrNull,
  line_items: jsonValueSchema.transform((value): Json => value ?? null),
});

/** Narrow one PostgREST row. */
export function toWooOrderRow(value: unknown): WooOrderRow | null {
  const parsed = wooOrderRowSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toWooOrderRows(rows: readonly unknown[] | null): WooOrderRow[] {
  return parseEach(wooOrderRowSchema, rows);
}
