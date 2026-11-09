import type { ListExpensePaymentsArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";

/** Preserves the existing list_expense_payments executor and side-effect order. */
export async function executeListExpensePayments(
  args: ListExpensePaymentsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const month = String(args.month || new Date().toISOString().slice(0, 7));
  let q = supabase
    .from("expense_payments")
    .select(
      "id, expense_type, expense_id, expense_name, amount, payment_month, paid_at, notes",
    )
    .eq("tenant_id", tenantId)
    .eq("payment_month", month)
    .order("paid_at", { ascending: false })
    .limit(200);
  if (args.expense_type) {
    q = q.eq("expense_type", args.expense_type);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return {
    month,
    count: data?.length || 0,
    total_paid: (data || []).reduce(
      (s: number, r: Pick<AgentRow<"expense_payments">, "amount">) =>
        s + (Number(r.amount) || 0),
      0,
    ),
    payments: data || [],
  };
}
