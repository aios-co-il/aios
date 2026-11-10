import type { ListFinanceArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { FinanceListRow } from "../tool-contracts-marketing.ts";

/** Preserves the existing list_finance executor and side-effect order. */
export async function executeListFinance(
  args: ListFinanceArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  let query = supabase
    .from("finance")
    .select("id, amount, type, description, date, client_id, clients(name)")
    .in("tenant_id", accessibleTenantIds)
    .order("date", { ascending: false })
    .limit(args.limit || 20);
  if (args.client_id) {
    query = query.eq("client_id", args.client_id);
  }
  if (args.type) {
    query = query.eq("type", args.type);
  }
  const { data, error } = await query.returns<Array<FinanceListRow>>();
  if (error) {
    throw error;
  }
  return {
    count: data.length,
    entries: data.map((f: FinanceListRow) => ({
      ...f,
      client_name: f.clients?.name,
    })),
    note: "legacy finance table — prefer get_accounting_overview",
  };
}
