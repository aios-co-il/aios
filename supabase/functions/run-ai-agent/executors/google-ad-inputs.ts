export type SyncGoogleAdsReportArgs = { table_id?: string; client_id?: string };

export type ConnectClientMetaAdAccountArgs = {
  client_id: string;
  ad_account_id: string;
  account_name?: string;
  platform?: "facebook" | "meta" | "facebook/meta";
  confirm_replace?: boolean;
};
