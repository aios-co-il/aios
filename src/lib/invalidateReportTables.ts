import type { QueryClient } from "@tanstack/react-query";

/** The dashboard's query of a client's report tables, keyed by client id. */
export function dashboardTablesQueryKey(clientId: string | null | undefined) {
  return ["crm-tables-for-dashboard", clientId] as const;
}

/**
 * Reload the report tables after a sync or a settings change: the report
 * pages' tables and every dashboard's. The tables carry each report's sync
 * time and outcome, so a dashboard that kept its old copy went on showing the
 * "הסנכרון האחרון נכשל" warning after a sync that succeeded.
 */
export function invalidateReportTables(
  queryClient: QueryClient,
  tenantId: string | null | undefined,
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["crm-tables", tenantId] }),
    queryClient.invalidateQueries({ queryKey: ["crm-tables-for-dashboard"] }),
  ]).then(() => undefined);
}
