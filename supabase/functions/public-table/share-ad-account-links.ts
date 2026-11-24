import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AdAccountShortcut,
  getAdAccountLinks,
  getTableAdAccountLinks,
} from "../_shared/share-links/ad-account-links.ts";
import {
  type AdAccountTable,
  type ClientAdLinks,
  toClientAdLinks,
} from "../_shared/share-links/ad-account-url.ts";

/** The shared table as public-table loads it (a full crm_tables row). */
export type ShareTableRow = {
  tenant_id?: string | null;
  client_id?: string | null;
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
};

/** The reads the links need, each scoped to the shared table's tenant. */
export type ShareAdAccountReads = {
  /** The client's saved links, or null when the client is not in the tenant. */
  tenantClientLinks(
    clientId: string,
    tenantId: string,
  ): Promise<ClientAdLinks | null>;
  /** The tenant's ads tables of the client, in the internal report's order. */
  tenantClientAdTables(
    clientId: string,
    tenantId: string,
  ): Promise<Array<AdAccountTable>>;
};

/** The report's client and whether the id came from the tenant-writable settings JSON. */
type ReportClient = { id: string; fromSettings: boolean };

/**
 * The share link's "open ad account" buttons, as the signed-in report shows
 * them: the table's own account, else the client's other ads accounts. A
 * link saved on the client card wins and is kept only when it points to its
 * platform's own site. It never rejects: a failed read logs and the report
 * shows no button, so the share link itself still opens.
 */
export async function shareTableAdAccountLinks(
  table: ShareTableRow,
  reads: ShareAdAccountReads,
): Promise<Array<AdAccountShortcut>> {
  try {
    return await buildLinks(table, reads);
  } catch (error) {
    console.error("[public-table] ad account links failed:", error);
    return [];
  }
}

/**
 * The links of `shareTableAdAccountLinks`. Every read is limited to the
 * table's tenant, and a client id taken from the settings JSON is used only
 * once that client is found in the tenant, so a share never links another
 * tenant's accounts.
 */
async function buildLinks(
  table: ShareTableRow,
  reads: ShareAdAccountReads,
): Promise<Array<AdAccountShortcut>> {
  const adTable = toAdAccountTable(table);
  const tenantId = uuidOrNull(table.tenant_id);
  const client = reportClientOf(table);
  if (!tenantId || !client) {
    return getTableAdAccountLinks(adTable, []);
  }

  const clientRow = await reads.tenantClientLinks(client.id, tenantId);
  if (!clientRow && client.fromSettings) {
    return getTableAdAccountLinks(adTable, []);
  }

  const clientLinks = toClientAdLinks(clientRow);
  const ownLinks = getTableAdAccountLinks(adTable, [], clientLinks);
  if (ownLinks.length > 0) {
    return ownLinks;
  }

  const clientTables = await reads.tenantClientAdTables(client.id, tenantId);
  return getAdAccountLinks(clientTables, clientLinks);
}

const AD_INTEGRATION_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service-role reads for public-table, each filtered by the shared table's
 * tenant_id. Tables of shared agencies in other tenants are not linked: the
 * buttons are the table tenant's own ads tables, in the order crm-tables
 * lists that tenant's tables (category, then newest first). A failed read
 * logs and shows no button.
 */
export function supabaseShareAdAccountReads(
  supabase: SupabaseClient,
): ShareAdAccountReads {
  return {
    async tenantClientLinks(clientId, tenantId) {
      const { data, error } = await supabase
        .from("clients")
        .select("meta_ads_url, google_ads_url")
        .eq("id", clientId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        console.error("[public-table] client ad links read failed:", error);
        return null;
      }
      return data;
    },
    async tenantClientAdTables(clientId, tenantId) {
      const { data, error } = await supabase
        .from("crm_tables")
        .select("integration_type, integration_settings")
        .eq("tenant_id", tenantId)
        .or(
          `client_id.eq.${clientId},integration_settings->>clientId.eq.${clientId}`,
        )
        .in("integration_type", AD_INTEGRATION_TYPES)
        .order("category", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[public-table] client ad tables read failed:", error);
        return [];
      }
      return (data || []).map(toAdAccountTable);
    },
  };
}

/**
 * The report's client, read the way DynamicTableView reads it: the client_id
 * column, else the legacy settings key. Only a uuid is used, because the id
 * goes into a PostgREST filter.
 */
function reportClientOf(table: ShareTableRow): ReportClient | null {
  const columnId = uuidOrNull(table.client_id);
  if (columnId) {
    return { id: columnId, fromSettings: false };
  }
  const settings = table.integration_settings || {};
  const settingsId = uuidOrNull(settings.clientId ?? settings.client_id);
  return settingsId ? { id: settingsId, fromSettings: true } : null;
}

/** A uuid string, or null for anything else. */
function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** The account ids a link is built from; every other setting is dropped. */
function toAdAccountTable(table: ShareTableRow): AdAccountTable {
  const settings = table.integration_settings || {};
  return {
    integration_type: table.integration_type ?? null,
    integration_settings: {
      ad_account_id: textOrNull(settings.ad_account_id),
      customer_id: textOrNull(settings.customer_id),
    },
  };
}

/** An id setting as text (some rows store it as a number), or null. */
function textOrNull(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value : null;
}
