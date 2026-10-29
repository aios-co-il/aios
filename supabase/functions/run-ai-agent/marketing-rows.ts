import { z } from "npm:zod@3.25.76";
import { Constants } from "../_shared/database.types.ts";
import { jsonSchema } from "./run-request.ts";
import type { MarketingWorkItemListRow } from "./tool-contracts-marketing.ts";

const optionalText = z.string().nullable();

/** `clients(name)` has no FK behind it in the generated schema, so rows arrive untyped. */
const marketingWorkItemListRowSchema: z.ZodType<
  MarketingWorkItemListRow,
  z.ZodTypeDef,
  unknown
> = z
  .object({
    id: z.string(),
    title: optionalText,
    status: z.enum(Constants.public.Enums.marketing_item_status),
    target_channel: optionalText,
    client_id: optionalText,
    pipeline_id: optionalText,
    current_stage_id: optionalText,
    payload: jsonSchema,
    updated_at: z.string(),
    clients: z.object({ name: z.string() }).passthrough().nullable(),
  })
  .passthrough();

/** Work items that match the list row shape; malformed rows are skipped. */
export function marketingWorkItemListRows(
  rows: unknown[],
): MarketingWorkItemListRow[] {
  return rows.flatMap((row) => {
    const parsed = marketingWorkItemListRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
