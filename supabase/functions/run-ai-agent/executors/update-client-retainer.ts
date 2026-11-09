import type { AccountingApprovalArgs } from "./accounting-approval-input.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Preserves the existing update_client_retainer executor and side-effect order. */
export async function executeUpdateClientRetainer(
  args: AccountingApprovalArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    agentId,
    callerRole,
    callerPhone,
    actorUserId,
    callerScope,
    name,
  } = context;

  if (args.client_id) {
    await assertCallerCanAccessClient(supabase, args.client_id, callerScope);
  }
  const acctTitles: Record<string, string> = {
    create_one_time_income: `הכנסה חד-פעמית: ${args.product_name || ""} ₪${args.amount ?? ""} (${args.payment_month || ""})`,
    delete_one_time_income: `מחיקת הכנסה חד-פעמית ${args.income_id}`,
    record_income_payment: `סימון גבייה ₪${args.amount ?? ""} לחודש ${args.payment_month || ""}`,
    delete_income_payment: `ביטול גבייה ${args.payment_id}`,
    record_expense_payment: `סימון הוצאה שולמה: ${args.expense_name || ""} ₪${args.amount ?? ""}`,
    delete_expense_payment: `ביטול תשלום הוצאה ${args.payment_id}`,
    update_client_retainer: `עדכון ריטיינר לקוח ${args.client_id} → ₪${args.retainer ?? "?"}`,
  };
  const { data: aqRow, error: aqErr } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: name,
      title: acctTitles[name] || name,
      description: "פעולת הנהלת חשבונות — דורשת אישור משתמש מפורש",
      tool_name: name,
      tool_input: args,
      context: { caller_role: callerRole, caller_phone: callerPhone },
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (aqErr) {
    throw aqErr;
  }
  return {
    pending_approval: true,
    approval_id: aqRow.id,
    action: name,
    summary: acctTitles[name] || name,
    instruction_for_carmen:
      'הצג למשתמש בקצרה את הפעולה הכספית ובקש אישור: "לאשר? (כן/לא)". אל תבצעי עד execute_pending_approval אחרי תשובה חיובית.',
  };
}
