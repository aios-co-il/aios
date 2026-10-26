/** The JSON settings column; integration-specific keys (e.g. SEO targets) pass through untouched. */
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | null | undefined =>
  value === null || typeof value === "string" ? value : undefined;

const optionalBoolean = (value: unknown): boolean | null | undefined =>
  value === null || typeof value === "boolean" ? value : undefined;

const SETTINGS_STRING_KEYS = [
  "ad_account_id",
  "customer_id",
  "last_sync_at",
] as const;

function toSettings(value: unknown): CrmTableIntegrationSettings | null {
  if (!isObject(value)) return null;
  const { ad_account_id, customer_id, last_sync_at, ...rest } = value;
  const known = { ad_account_id, customer_id, last_sync_at };
  const settings: CrmTableIntegrationSettings = { ...rest };
  for (const key of SETTINGS_STRING_KEYS) {
    const field = optionalString(known[key]);
    if (field !== undefined) settings[key] = field;
  }
  return settings;
}

/** Keeps a row with a usable `id`/`name`/`slug`; optional fields of an unexpected type become `undefined`. */
export function toCrmTableSummary(value: unknown): CrmTableSummary | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.slug !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    client_id: optionalString(value.client_id),
    tenant_id: optionalString(value.tenant_id),
    integration_type: optionalString(value.integration_type),
    integration_settings:
      value.integration_settings === undefined
        ? undefined
        : toSettings(value.integration_settings),
    campaign_active: optionalBoolean(value.campaign_active),
    last_sync_at: optionalString(value.last_sync_at),
  };
}

/** The table list from a `crm-tables` GET response; only rows without a string `id`, `name` or `slug` are dropped. */
export function parseCrmTableList(data: unknown): CrmTableSummary[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(toCrmTableSummary)
    .filter((row): row is CrmTableSummary => row !== null);
}
