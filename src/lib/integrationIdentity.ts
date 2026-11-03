import type { Database } from "@/integrations/supabase/types";
import type { ClientIntegration } from "@/lib/tenantIntegrationsClient";

type IntegrationIdentity = Pick<
  Database["public"]["Tables"]["tenant_integrations"]["Row"],
  "id"
>;

/** Keep integration consumers on the database's string-id contract. */
export function hasIntegrationId(
  integration: ClientIntegration,
): integration is ClientIntegration & IntegrationIdentity {
  if (typeof integration.id === "string") {
    return true;
  }
  console.error("Ignoring integration with an invalid id");
  return false;
}
