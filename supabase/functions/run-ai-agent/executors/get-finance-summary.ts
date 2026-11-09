import type { GetFinanceSummaryArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentRow } from "../database-contracts.ts";

/** Preserves the existing get_finance_summary executor and side-effect order. */
export async function executeGetFinanceSummary(
  args: GetFinanceSummaryArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const month = args.month || new Date().toISOString().slice(0, 7);
  const startDate = `${month}-01`;
  const endDate = new Date(
    parseInt(month.split("-")[0]),
    parseInt(month.split("-")[1]),
    0,
  )
    .toISOString()
    .split("T")[0];
  const { data, error } = await supabase
    .from("finance")
    .select("amount, type")
    .in("tenant_id", accessibleTenantIds)
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) {
    throw error;
  }
  const financeRows: Array<Pick<AgentRow<"finance">, "amount" | "type">> =
    data || [];
  const income = financeRows
    .filter((f) => f.type === "income")
    .reduce((s, f) => s + (f.amount || 0), 0);
  const expense = financeRows
    .filter((f) => f.type === "expense")
    .reduce((s, f) => s + (f.amount || 0), 0);
  return {
    month,
    income,
    expense,
    profit: income - expense,
    entries_count: data.length,
    note: "legacy finance table — prefer get_accounting_overview",
  };
}
