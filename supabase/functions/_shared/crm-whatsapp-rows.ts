import { asRecords, optString } from "./provider-json-b23.ts";

export type IntegrationRow = {
  id: string;
  integration_type: string;
  user_id?: string | null;
};

/** tenant_integrations rows (id, integration_type, user_id) with string ids only. */
export const integrationRows = (data: unknown): IntegrationRow[] =>
  asRecords(data).flatMap((row) => {
    const id = optString(row.id);
    const integrationType = optString(row.integration_type);
    if (!id || integrationType === undefined) return [];
    return [
      {
        id,
        integration_type: integrationType,
        user_id: optString(row.user_id) ?? null,
      },
    ];
  });
