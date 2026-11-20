export type GetLatestCampaignPulseArgs = {
  client_id?: string;
  client_name?: string;
  agency_id?: string;
  agency_name?: string;
  status?: "healthy" | "warning" | "critical" | "no_data";
};

export type REFRESHPULSETOOLNAMEArgs = {
  client_id?: string;
  client_name?: string;
};

export type AnalyzeCampaignPerformanceArgs = {
  client_id?: string;
  agency_id?: string;
  agency_name?: string;
};

export type UpdateClientHealthArgs = {
  client_id: string;
  mood_status: "happy" | "wavering" | "churn_risk";
  communication_status?: "normal" | "sensitive" | "complaint";
  note: string;
};

export type GetClientRetentionScanArgs = {
  client_id?: string;
  client_name?: string;
};

export type BatchUpdateClientHealthArgs = {
  updates: Array<{
    client_id: string;
    mood_status: "happy" | "wavering" | "churn_risk";
    communication_status?: "normal" | "sensitive" | "complaint";
    note: string;
  }>;
};
