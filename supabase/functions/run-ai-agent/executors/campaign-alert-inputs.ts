export type GetCampaignAlertsArgs = {
  client_id?: string;
  severity?: "info" | "warning" | "critical";
  only_open?: boolean;
};

export type AcknowledgeCampaignAlertArgs = { alert_id: string };

export type ResolveCampaignAlertArgs = { alert_id: string };
