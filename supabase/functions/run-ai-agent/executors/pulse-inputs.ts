export type GetLatestCampaignPulseArgs = {
  client_id?: string;
  client_name?: string;
  agency_id?: string;
  agency_name?: string;
  status?: "healthy" | "warning" | "critical" | "no_data";
};

export type AnalyzeCampaignPerformanceArgs = {
  client_id?: string;
  agency_id?: string;
  agency_name?: string;
};
