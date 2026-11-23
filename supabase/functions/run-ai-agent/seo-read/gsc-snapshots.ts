import type { GscKeywordRow } from "../../_shared/gscKeywords.ts";
import type {
  SeoClient,
  SeoDb,
  SeoToolContext,
  SeoUnavailable,
} from "./context.ts";
import { throwIfError } from "./context.ts";

/** One stored Search Console window (cron-sync-gsc-keywords writes them daily). */
export type GscSnapshot = {
  periodKey: string;
  startDate: string;
  endDate: string;
  syncedAt: string | null;
  rows: Array<GscKeywordRow>;
};

/** The client's property and its stored windows. */
export type GscSnapshots = { siteUrl: string; snapshots: Array<GscSnapshot> };

/**
 * The client's Search Console property: the integration's `client_sites`
 * mapping first (what the cron syncs), else the client card's gsc_site_url.
 * Then its stored windows. Reads tokens' rows but returns only the site URL.
 */
export async function readGscSnapshots(
  db: SeoDb,
  ctx: SeoToolContext,
  client: SeoClient,
): Promise<GscSnapshots | SeoUnavailable> {
  const { data: integrations, error } = await db
    .from("tenant_integrations")
    .select("tenant_id, settings")
    .eq("integration_type", "google_search_console")
    .eq("is_active", true)
    .in("tenant_id", ctx.accessibleTenantIds);
  throwIfError("חיבורי Search Console", error);
  if (!integrations?.length) {
    return {
      status: "not_connected",
      message: "Search Console לא מחובר בארגון. מחברים במסך האינטגרציות.",
    };
  }
  const siteUrl = mappedSite(integrations, client.id) ?? client.gscSiteUrl;
  if (!siteUrl) {
    return {
      status: "no_site_mapped",
      message: `Search Console מחובר, אבל לא שויך נכס (property) ל${client.name}. משייכים בדוח ה-SEO של הלקוח.`,
    };
  }
  const { data: rows, error: snapError } = await db
    .from("gsc_keyword_snapshots")
    .select("period_key, start_date, end_date, keywords, synced_at, client_id")
    .eq("site_url", siteUrl)
    .in("tenant_id", ctx.accessibleTenantIds);
  throwIfError("נתוני Search Console", snapError);
  // A snapshot of the same property may be stored without a client (older syncs).
  const snapshots = (rows ?? [])
    .filter((row) => !row.client_id || row.client_id === client.id)
    .map((row) => ({
      periodKey: row.period_key,
      startDate: row.start_date,
      endDate: row.end_date,
      syncedAt: row.synced_at,
      rows: keywordRows(row.keywords),
    }))
    .filter((snapshot) => snapshot.rows.length > 0);
  if (!snapshots.length) {
    return {
      status: "no_data",
      message: `לנכס ${siteUrl} עדיין אין נתונים שמורים. הסנכרון היומי ימלא אותם.`,
    };
  }
  return { siteUrl, snapshots };
}

/** The property an active integration maps to this client, if any. */
function mappedSite(
  integrations: Array<{ settings: unknown }>,
  clientId: string,
): string | null {
  for (const integration of integrations) {
    const settings = integration.settings;
    if (!settings || typeof settings !== "object") {
      continue;
    }
    const sites = (settings as { client_sites?: unknown }).client_sites;
    if (sites && typeof sites === "object") {
      const site = (sites as Record<string, unknown>)[clientId];
      if (typeof site === "string" && site) {
        return site;
      }
    }
  }
  return null;
}

/** Stored keyword rows, skipping entries that are not GSC rows. */
function keywordRows(value: unknown): Array<GscKeywordRow> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (row): row is GscKeywordRow =>
      !!row && typeof row === "object" && typeof row.keyword === "string",
  );
}
