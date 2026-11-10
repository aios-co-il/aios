export type QuerySystemGraphArgs = {
  query: string;
  depth?: number;
  limit?: number;
};

export type SearchEntitiesArgs = {
  entity_type: "agency" | "client" | "campaigner" | "sales_person" | "lead";
  search_term: string;
  agency_id?: string;
  all_scopes?: boolean;
  include_inactive?: boolean;
};

export type SetCampaignTableActiveArgs = {
  client_id?: string;
  table_id?: string;
  table_name?: string;
  active: boolean;
};

export type ListIntegrationsArgs = { type?: string; only_active?: boolean };

export type ToggleIntegrationArgs = {
  integration_id: string;
  is_active: boolean;
};

export type ListAgentsArgs = { only_active?: boolean };

export type CreateAgentArgs = {
  name: string;
  talent: string;
  personality?: string;
  soul?: string;
  engine?: string;
};

export type UpdateAgentArgs = {
  agent_id: string;
  name?: string;
  talent?: string;
  personality?: string;
  soul?: string;
  engine?: string;
  active?: boolean;
};

export type CreateWhatsappInstanceArgs = {
  displayName: string;
  countryCode?: string;
};

export type GetWhatsappQrLinkArgs = { integrationId: string };

export type GetWhatsappStatusArgs = { integrationId: string };

export type SendWhatsappViaGatewayArgs = {
  integrationId?: string;
  phone: string;
  message: string;
};
