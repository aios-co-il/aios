import type { SyncableReportTable } from "@/lib/reportSync";

/**
 * A report table as the client card's list gives it (a crm-tables row): what
 * the live view, the sync, the freshness line and the ad account link read.
 */
export type ClientCardTable = SyncableReportTable & {
  name: string;
  slug: string;
  last_sync_at?: string | null;
  last_sync_outcome?: unknown;
  integration_settings?:
    | (Record<string, unknown> & {
        last_sync_at?: string | null;
        ad_account_id?: string | null;
        customer_id?: string | null;
      })
    | null;
};
