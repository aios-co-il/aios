export type CrmTableIntegrationSettings = Record<string, unknown> & {
  ad_account_id?: string | null;
  customer_id?: string | null;
  last_sync_at?: string | null;
};

/** A `crm_tables` row as returned by the `crm-tables` edge function list. */
export interface CrmTableSummary {
  id: string;
  name: string;
  slug: string;
  client_id?: string | null;
  tenant_id?: string | null;
  integration_type?: string | null;
  integration_settings?: CrmTableIntegrationSettings | null;
  campaign_active?: boolean | null;
  last_sync_at?: string | null;
}

const isOptional = (value: unknown, type: "string" | "boolean") =>
  value === undefined || value === null || typeof value === type;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSettings = (
  value: unknown,
): value is CrmTableIntegrationSettings | null | undefined =>
  value === undefined ||
  value === null ||
  (isObject(value) &&
    isOptional(value.ad_account_id, "string") &&
    isOptional(value.customer_id, "string") &&
    isOptional(value.last_sync_at, "string"));

export function isCrmTableSummary(value: unknown): value is CrmTableSummary {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    isOptional(value.client_id, "string") &&
    isOptional(value.tenant_id, "string") &&
    isOptional(value.integration_type, "string") &&
    isOptional(value.campaign_active, "boolean") &&
    isOptional(value.last_sync_at, "string") &&
    isSettings(value.integration_settings)
  );
}

/** The table list from a `crm-tables` GET response; rows of unexpected shape are dropped. */
export function parseCrmTableList(data: unknown): CrmTableSummary[] {
  return Array.isArray(data) ? data.filter(isCrmTableSummary) : [];
}
