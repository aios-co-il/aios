import type { Database } from "@/integrations/supabase/types";

type IntegrationIdentity = Pick<
  Database["public"]["Tables"]["tenant_integrations"]["Row"],
  "id"
>;

/** Keep integration selectors on the database's string-id contract. */
export function hasIntegrationId<T extends { id?: unknown }>(
  integration: T,
): integration is T & IntegrationIdentity {
  if (typeof integration.id === "string") {
    return true;
  }
  console.error("Ignoring integration with an invalid id");
  return false;
}
