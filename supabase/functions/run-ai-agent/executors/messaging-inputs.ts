export type SendMessageArgs = {
  contact_type: "lead" | "client";
  contact_id: string;
  message_text: string;
};

export type LookupStaffWhatsappArgs = {
  entity_type?: "campaigner" | "sales_person" | "team_member" | "auto";
  search?: string;
  only_with_phone?: boolean;
  limit?: number;
};

export type SendMessageToCampaignerArgs = {
  campaigner_id?: string;
  message_text: string;
  name?: string;
};

export type GetMaskyooCallsReportArgs = {
  client_id?: string;
  client_name?: string;
  period_start?: string;
  period_end?: string;
  category?: "organic" | "paid" | "all";
  period_compare?: boolean;
};

export type SyncMaskyooCdrArgs = { from_date?: string };

export type ListWaGroupsArgs = { name_search?: string; limit?: number };
