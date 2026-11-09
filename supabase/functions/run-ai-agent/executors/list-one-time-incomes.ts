import type { ListOneTimeIncomesArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";
import type { OneTimeIncomeRow } from "../tool-contracts-marketing.ts";

/** Preserves the existing list_one_time_incomes executor and side-effect order. */
export async function executeListOneTimeIncomes(
  args: ListOneTimeIncomesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const month = String(args.month || new Date().toISOString().slice(0, 7));
  let q = supabase
    .from("one_time_incomes")
    .select(
      "id, client_id, product_name, amount, payment_month, notes, is_paid, clients(name)",
    )
    .eq("tenant_id", tenantId)
    .eq("payment_month", month)
    .order("created_at", { ascending: false })
    .limit(100);
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
    total: (data || []).reduce(
      (s: number, r: Pick<AgentRow<"one_time_incomes">, "amount">) =>
        s + (Number(r.amount) || 0),
      0,
    ),
    incomes: (data || []).map(
      (
        r: OneTimeIncomeRow & Pick<AgentRow<"one_time_incomes">, "is_paid">,
      ) => ({
        ...r,
        client_name: r.clients?.name,
      }),
    ),
  };
}
