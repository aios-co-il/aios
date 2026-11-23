export type GetAccountingOverviewArgs = {
  month?: string;
  agency_id?: string;
  agency_name?: string;
};

export type UpdateClientRetainerArgs = {
  client_id: string;
  retainer?: number;
  monthly_budget?: number;
  notes?: string;
};
