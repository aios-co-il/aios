/**
 * ad-preview's database reads. The signed-in path reads the table as the
 * caller, so the report page's own RLS decides access; the share path reads
 * it through an active share link with the service role, keyed by the share's
 * tenant. Every service-role read filters by that trusted tenant.
 */
import { resolveMetaReportToken } from "../_shared/meta-report-token.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { AdPreviewStore, ReportTable } from "./handler.ts";

const TABLE_COLUMNS = "id, tenant_id, integration_type, integration_settings";

type TableRow = {
  id: string;
  tenant_id: string;
  integration_type: string | null;
  integration_settings: unknown;
};

/** The store over the service-role client and the caller's own client. */
export function adPreviewStore(
  service: Pick<DbClient, "from">,
  caller: Pick<DbClient, "from">,
): AdPreviewStore {
  return {
    async tableForUser(tableId) {
      const { data, error } = await caller
        .from("crm_tables")
        .select(TABLE_COLUMNS)
        .eq("id", tableId)
        .maybeSingle();
      if (error) {
        throw new Error(`crm_tables read as caller failed: ${error.message}`);
      }
      return data ? reportTableOf(data) : null;
    },

    async tableForShare(shareToken) {
      const { data: share, error } = await service
        .from("table_shares")
        .select("table_id, tenant_id")
        .eq("share_token", shareToken)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        throw new Error(`table_shares lookup failed: ${error.message}`);
      }
      if (!share) {
        return null;
      }
      const { data, error: tableError } = await service
        .from("crm_tables")
        .select(TABLE_COLUMNS)
        .eq("id", share.table_id)
        .eq("tenant_id", share.tenant_id)
        .maybeSingle();
      if (tableError) {
        throw new Error(`crm_tables lookup failed: ${tableError.message}`);
      }
      return data ? reportTableOf(data) : null;
    },

    async hasAdRow(table, adId) {
      const { data, error } = await service
        .from("crm_records")
        .select("id")
        .eq("tenant_id", table.tenantId)
        .eq("table_id", table.id)
        .eq("data->>entity_level", "ad")
        .eq("data->>ad_id", adId)
        .limit(1);
      if (error) {
        throw new Error(`crm_records ad lookup failed: ${error.message}`);
      }
      return (data ?? []).length > 0;
    },

    metaToken(table) {
      return resolveMetaReportToken(service, {
        tenantId: table.tenantId,
        integrationId: table.integrationId,
      });
    },
  };
}

/** The table with the Meta connection its sync uses, read as fb-campaign-monitor reads it. */
function reportTableOf(row: TableRow): ReportTable {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    integrationType: row.integration_type,
    integrationId:
      settingOf(row.integration_settings, "integration_id") ||
      settingOf(row.integration_settings, "integrationId"),
  };
}

/** A non-empty string setting of integration_settings, or null. */
function settingOf(settings: unknown, key: string): string | null {
  if (!settings || typeof settings !== "object" || !(key in settings)) {
    return null;
  }
  const value: unknown = Reflect.get(settings, key);
  return typeof value === "string" && value ? value : null;
}
