export type ScheduleCampaignToggleArgs = {
  entity_id: string;
  entity_type: "fb_campaign" | "fb_adset" | "fb_ad" | "google_campaign";
  action: "pause" | "resume";
  cron_expression?: string;
  run_at?: string;
  timezone?: string;
  client_id?: string;
  notes?: string;
};

export type ListCampaignSchedulesArgs = {
  client_id?: string;
  only_enabled?: boolean;
  limit?: number;
};

export type CancelCampaignScheduleArgs = { schedule_id: string };
