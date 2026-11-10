import type { ListIncomePaymentsArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";

/** Preserves the existing list_income_payments executor and side-effect order. */
export async function executeListIncomePayments(
  args: ListIncomePaymentsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const month = String(args.month || new Date().toISOString().slice(0, 7));
  let q = supabase
    .from("income_payments")
    .select(
      "id, client_id, client_name, amount, payment_month, received_at, notes",
    )
    .eq("tenant_id", tenantId)
    .eq("payment_month", month)
    .order("received_at", { ascending: false })
    .limit(200);
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  const { data, error } = await q;
  if (error) {
    throw error;
  }
  return {
    month,
    count: data?.length || 0,
    total_collected: (data || []).reduce(
      (s: number, r: Pick<AgentRow<"income_payments">, "amount">) =>
        s + (Number(r.amount) || 0),
      0,
    ),
    payments: data || [],
  };
}
