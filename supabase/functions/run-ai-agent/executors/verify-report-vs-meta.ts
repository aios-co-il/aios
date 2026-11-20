import type { VerifyReportVsMetaArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { listVerifyTables } from "../verify-tables.ts";
import { verifyReportVsMeta } from "../verify-report-vs-meta.ts";

/** Preserves the existing verify_report_vs_meta executor and side-effect order. */
export async function executeVerifyReportVsMeta(
  args: VerifyReportVsMetaArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds, isManagerRole, callerScope } = context;

  if (args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  } else if (!isManagerRole) {
    throw new Error("בדיקה לכל הלקוחות זמינה למנהלים בלבד — העבירי client_id");
  }
  const days = Math.min(Math.max(Number(args.days) || 7, 1), 30);
  const tables = await listVerifyTables(supabase, {
    tenantIds: accessibleTenantIds,
    clientId: args.client_id || null,
    agencyName: args.agency_name || null,
  });
  if (!tables.length) {
    return {
      checked: 0,
      note: "לא נמצא דוח פייסבוק פעיל עם חשבון מודעות בסקופ",
    };
  }
  return await verifyReportVsMeta({
    db: supabase,
    tables,
    days,
    now: new Date(),
    fallbackTenantIds: accessibleTenantIds.slice(0, 1),
  });
}
