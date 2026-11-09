export type ListFacebookAdAccountsArgs = unknown;

export type CreateFacebookReportTableArgs = {
  client_id: string;
  ad_account_id: string;
  ad_account_name: string;
};

export type VerifyReportVsMetaArgs = {
  client_id?: string;
  agency_name?: string;
  days?: number;
};

export type GetReconciliationStatusArgs = { client_id?: string };

export type CheckAdAccountsHealthArgs = {
  client_id?: string;
  agency_id?: string;
};

export type ListUnconnectedClientsArgs = unknown;

export type GetDashboardStatsArgs = unknown;
