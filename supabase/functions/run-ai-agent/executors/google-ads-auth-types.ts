export type GoogleAdsAuthSettings = {
  refresh_token?: string;
  login_customer_id?: string | number;
  mcc_id?: string | number;
  manager_id?: string | number;
};

export type GoogleAdsIntegrationProjection = {
  settings: GoogleAdsAuthSettings | null;
  additional_config?: GoogleAdsAuthSettings | null;
  api_key?: string | null;
};
