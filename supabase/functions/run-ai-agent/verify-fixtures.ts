/**
 * Test helpers for the verify_report_vs_meta tests (not imported by
 * run-ai-agent): a leads report table and a token store (AIO-238).
 */
import { memoryDb } from "../_shared/reconcile/memory-db.ts";
import type { ListedTable } from "../_shared/reconcile/types.ts";

export const table: ListedTable = {
  id: "t1",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_1", campaign_type: "leads" },
  client_name: "לקוח",
  client_status: "active",
  agency_name: "סוכנות",
};

/** A database with one active org-level Meta connection on tenant-1. */
export function tokenDb() {
  return memoryDb({
    tenant_integrations: [
      {
        id: "conn-1",
        tenant_id: "tenant-1",
        integration_type: "facebook",
        is_active: true,
        connection_visibility: "org",
        api_key: "EAABtokentokentokentokentoken",
        updated_at: "2026-10-20T00:00:00Z",
      },
    ],
  });
}
