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
  client_id?: string | null;
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
};

/** The reads the links need, injected so tests can fake them. */
export type ShareAdAccountReads = {
  clientLinks(clientId: string): Promise<ClientAdLinks | null>;
  clientAdTables(clientId: string): Promise<Array<AdAccountTable>>;
};

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

/** The links of `shareTableAdAccountLinks`, reading the client only when needed. */
async function buildLinks(
  table: ShareTableRow,
  reads: ShareAdAccountReads,
): Promise<Array<AdAccountShortcut>> {
  const adTable = toAdAccountTable(table);
  const clientId = reportClientIdOf(table);
  if (!clientId) {
    return getTableAdAccountLinks(adTable, []);
  }

  const clientLinks = toClientAdLinks(await reads.clientLinks(clientId));
  const ownLinks = getTableAdAccountLinks(adTable, [], clientLinks);
  if (ownLinks.length > 0) {
    return ownLinks;
  }

  return getAdAccountLinks(await reads.clientAdTables(clientId), clientLinks);
}

const AD_INTEGRATION_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service-role reads for public-table. Like public-dashboard, the client's
 * tables are matched by client only: ads tables may sit under another tenant
 * (shared agency) while linked to this client, and the share token already
 * authorises the view. A failed read logs and shows no button.
 */
export function supabaseShareAdAccountReads(
  supabase: SupabaseClient,
): ShareAdAccountReads {
  return {
    async clientLinks(clientId) {
      const { data, error } = await supabase
        .from("clients")
        .select("meta_ads_url, google_ads_url")
        .eq("id", clientId)
        .maybeSingle();
      if (error) {
        console.error("[public-table] client ad links read failed:", error);
        return null;
      }
      return data;
    },
    async clientAdTables(clientId) {
      const { data, error } = await supabase
        .from("crm_tables")
        .select("integration_type, integration_settings")
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
 * The report's client, read the way DynamicTableView reads it. Only a uuid is
 * used, because the id goes into a PostgREST filter.
 */
function reportClientIdOf(table: ShareTableRow): string | null {
  const settings = table.integration_settings || {};
  const candidate =
    table.client_id || settings.clientId || settings.client_id || null;
  return typeof candidate === "string" && UUID.test(candidate)
    ? candidate
    : null;
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
