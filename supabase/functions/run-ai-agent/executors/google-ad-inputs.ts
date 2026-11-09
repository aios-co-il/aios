export type ListGoogleAdAccountsArgs = { client_id?: string };

export type ListGoogleCampaignsArgs = {
  customer_id?: string;
  client_id?: string;
  name_search?: string;
  status?: "ENABLED" | "PAUSED" | "REMOVED" | "ALL";
};

export type CreateGoogleAdsReportTableArgs = {
  client_id: string;
  customer_id: string;
  account_name?: string;
  date_range?: string;
};

export type SyncGoogleAdsReportArgs = { table_id?: string; client_id?: string };

export type SyncFacebookInsightsArgs = {
  table_id?: string;
  client_id?: string;
};

export type ConnectGoogleAdsAccountArgs = {
  client_id: string;
  customer_id: string;
};

export type ConnectClientMetaAdAccountArgs = {
  client_id: string;
  ad_account_id: string;
  account_name?: string;
  platform?: "facebook" | "meta" | "facebook/meta";
  confirm_replace?: boolean;
};
