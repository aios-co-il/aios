import { z } from "npm:zod@3.25.76";
import { metaAdAccountIdSchema } from "./tool-storage-contracts.ts";

/** Decode report settings before resolving campaign goals or account ids. */
export function readReportSettings(value: unknown): ReportSettings {
  const parsed = reportSettingsSchema.passthrough().safeParse(value ?? {});
  if (!parsed.success) {
    console.warn(
      "[reports] Invalid stored settings",
      parsed.error.issues.map((issue) => issue.path),
    );
    return {};
  }
  return parsed.data;
}

const reportSettingsSchema = z.object({
  ad_account_id: metaAdAccountIdSchema.nullable(),
  account_id: metaAdAccountIdSchema.nullable(),
  meta_account_id: metaAdAccountIdSchema.nullable(),
  customer_id: metaAdAccountIdSchema.nullable(),
  ad_account_name: z.string().nullish().catch(invalidReportField),
  account_status: z
    .union([z.string(), z.number()])
    .nullish()
    .catch(invalidReportField),
  campaign_type: z.string().nullish().catch(invalidReportField),
});
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

/** Discard only the malformed optional field, retaining the table's valid settings. */
function invalidReportField(context: { error: z.ZodError }): undefined {
  console.warn(
    "[reports] Invalid stored field",
    context.error.issues.map((issue) => issue.path),
  );
  return undefined;
}
