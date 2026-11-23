import { loadAccountingClients } from "./accounting-clients.ts";
import type { GetAccountingOverviewArgs } from "./finance-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

import type { OneTimeIncomeRow } from "../tool-contracts-marketing.ts";
import type { AgentRow } from "../database-contracts.ts";

/** Preserves the existing get_accounting_overview executor and side-effect order. */
export async function executeGetAccountingOverview(
  args: GetAccountingOverviewArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const month = String(args.month || new Date().toISOString().slice(0, 7));
  const { agencyId, enriched } = await loadAccountingClients(args, context);
  const expectedRetainers = enriched
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.retainer, 0);

  let otiQ = supabase
    .from("one_time_incomes")
    .select(
      "id, client_id, product_name, amount, payment_month, notes, clients(name)",
    )
    .eq("tenant_id", tenantId)
    .eq("payment_month", month);
  if (agencyId) {
    const agencyClientIds = enriched.map((c) => c.client_id);
    otiQ = otiQ.in(
      "client_id",
      agencyClientIds.length
        ? agencyClientIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const { data: oneTime } = await otiQ.limit(200);
  const oneTimeRows: Array<OneTimeIncomeRow> = oneTime || [];
  const oneTimeTotal = oneTimeRows.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );

  let ipQ = supabase
    .from("income_payments")
    .select("id, client_id, client_name, amount, payment_month, received_at")
    .eq("tenant_id", tenantId)
    .eq("payment_month", month);
  if (agencyId) {
    const agencyClientIds = enriched.map((c) => c.client_id);
    ipQ = ipQ.in(
      "client_id",
      agencyClientIds.length
        ? agencyClientIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const { data: incomePayments } = await ipQ.limit(500);
  const incomePaymentRows: Array<
    Pick<AgentRow<"income_payments">, "client_id" | "amount">
  > = incomePayments || [];
  const collected = incomePaymentRows.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );

  const { data: expensePayments } = await supabase
    .from("expense_payments")
    .select(
      "id, expense_type, expense_id, expense_name, amount, payment_month, paid_at",
    )
    .eq("tenant_id", tenantId)
    .eq("payment_month", month)
    .limit(500);
  const expensePaymentRows: Array<
    Pick<AgentRow<"expense_payments">, "amount">
  > = expensePayments || [];
  const expensesPaid = expensePaymentRows.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );
  const expectedFixedExpenses = enriched
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.monthly_fixed_expense, 0);

  return {
    month,
    agency_id: agencyId || null,
    expected_retainers: expectedRetainers,
    one_time_incomes_total: oneTimeTotal,
    expected_income: expectedRetainers + oneTimeTotal,
    collected_income: collected,
    collection_gap: expectedRetainers + oneTimeTotal - collected,
    expected_fixed_client_expenses: expectedFixedExpenses,
    expenses_paid: expensesPaid,
    estimated_gross: collected - expensesPaid,
    clients_count: enriched.length,
    active_with_retainer: enriched.filter(
      (c) => c.status === "active" && c.retainer > 0,
    ).length,
    one_time_incomes: oneTimeRows.slice(0, 30).map((r) => ({
      id: r.id,
      client_id: r.client_id,
      client_name: r.clients?.name,
      product_name: r.product_name,
      amount: r.amount,
    })),
    top_uncollected_retainers: enriched
      .filter((c) => c.status === "active" && c.retainer > 0)
      .filter(
        (c) =>
          !incomePaymentRows.some(
            (p) =>
              p.client_id === c.client_id && Number(p.amount) === c.retainer,
          ),
      )
      .sort((a, b) => b.retainer - a.retainer)
      .slice(0, 15)
      .map((c) => ({
        client_id: c.client_id,
        name: c.name,
        retainer: c.retainer,
        agency: c.agency,
      })),
  };
}
