export type ListFinanceArgs = {
  client_id?: string;
  type?: "income" | "expense";
  limit?: number;
};

export type CreateFinanceEntryArgs = {
  client_id?: string;
  amount: number;
  type: "income" | "expense";
  description: string;
  date?: string;
};

export type GetFinanceSummaryArgs = { month?: string };

export type GetAccountingOverviewArgs = {
  month?: string;
  agency_id?: string;
  agency_name?: string;
};

export type GetClientRetainerArgs = {
  client_id?: string;
  client_name?: string;
};

export type ListOneTimeIncomesArgs = { month?: string; client_id?: string };

export type ListIncomePaymentsArgs = { month?: string; client_id?: string };

export type ListExpensePaymentsArgs = { month?: string; expense_type?: string };

export type ListInvoiceUploadsArgs = {
  status?: "pending" | "processed" | "linked" | "failed";
  limit?: number;
};

export type UpdateClientRetainerArgs = {
  client_id: string;
  retainer?: number;
  monthly_budget?: number;
  notes?: string;
};
