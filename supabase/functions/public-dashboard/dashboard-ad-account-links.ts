import {
  type AdAccountShortcut,
  getAdAccountLinks,
} from "../_shared/share-links/ad-account-links.ts";
import {
  type AdAccountTable,
  type ClientAdLinks,
  toClientAdLinks,
} from "../_shared/share-links/ad-account-url.ts";

/** The shared dashboard as public-dashboard loads it, with its client joined. */
export type ShareDashboardRow = {
  tenant_id?: string | null;
  clients?: (ClientAdLinks & { tenant_id?: string | null }) | null;
};

/** A dashboard table as the links read it. */
export type DashboardAdTable = AdAccountTable & { tenant_id?: string | null };

/**
 * The dashboard share's "open ad account" buttons. The share renders the
 * client's tables from every tenant, but the buttons link only the
 * dashboard tenant's own tables, and the client's saved links only when the
 * client belongs to that tenant, so a share never opens another tenant's
 * ad account.
 */
export function dashboardAdAccountLinks(
  dashboard: ShareDashboardRow,
  tables: Array<DashboardAdTable>,
): Array<AdAccountShortcut> {
  const tenantId = dashboard.tenant_id;
  if (!tenantId) {
    return [];
  }
  const tenantTables = tables.filter((table) => table.tenant_id === tenantId);
  const client =
    dashboard.clients?.tenant_id === tenantId ? dashboard.clients : null;
  return getAdAccountLinks(tenantTables, toClientAdLinks(client));
}
