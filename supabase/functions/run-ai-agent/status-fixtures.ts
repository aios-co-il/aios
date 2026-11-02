/**
 * Test helpers for the get_reconciliation_status tests (not imported by
 * run-ai-agent, AIO-238).
 */

/** A run of table t1 of tenant-1. */
export const statusRun = (
  id: string,
  status: string,
  started_at: string,
  summary: Record<string, unknown>,
) => ({
  id,
  tenant_id: "tenant-1",
  client_id: "client-1",
  table_id: "t1",
  platform: "meta",
  status,
  started_at,
  finished_at: started_at,
  window_start: status === "ok" ? "2026-10-18" : null,
  window_end: status === "ok" ? "2026-10-24" : null,
  summary,
  crm_tables: { name: "דוח לידים" },
  clients: { name: "לקוח" },
});
