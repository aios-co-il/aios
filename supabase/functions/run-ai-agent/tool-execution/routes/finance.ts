import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListFinance } from "../../executors/list-finance.ts";
import { executeCreateFinanceEntry } from "../../executors/create-finance-entry.ts";
import { executeGetFinanceSummary } from "../../executors/get-finance-summary.ts";
import { executeGetAccountingOverview } from "../../executors/get-accounting-overview.ts";
import { executeGetClientRetainer } from "../../executors/get-client-retainer.ts";
import { executeListOneTimeIncomes } from "../../executors/list-one-time-incomes.ts";
import { executeListIncomePayments } from "../../executors/list-income-payments.ts";
import { executeListExpensePayments } from "../../executors/list-expense-payments.ts";
import { executeListInvoiceUploads } from "../../executors/list-invoice-uploads.ts";

/** finance tool routes; argument assertions retain the legacy tool boundary. */
export const financeRoutes: Record<string, ToolRoute> = {
  list_finance: bindToolRoute(executeListFinance),
  create_finance_entry: bindToolRoute(executeCreateFinanceEntry),
  get_finance_summary: bindToolRoute(executeGetFinanceSummary),
  get_accounting_overview: bindToolRoute(executeGetAccountingOverview),
  get_client_retainer: bindToolRoute(executeGetClientRetainer),
  list_one_time_incomes: bindToolRoute(executeListOneTimeIncomes),
  list_income_payments: bindToolRoute(executeListIncomePayments),
  list_expense_payments: bindToolRoute(executeListExpensePayments),
  list_invoice_uploads: bindToolRoute(executeListInvoiceUploads),
};
