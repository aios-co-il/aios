import type { AgentDatabaseClient } from "../database-contracts.ts";
import { expandClientSearchTerms } from "./client-search-terms.ts";
import type { SearchClient } from "../helper-results.ts";
import { readReportSettings } from "../report-settings.ts";

/**
 * Broad client lookup: CRM name/contact, crm_tables name, Meta ad account names,
 * all statuses (including ended). Used by search_entities / list_clients name search.
 */
export async function searchClientsBroadly(
  supabase: AgentDatabaseClient,
  accessibleTenantIds: Array<string>,
  searchTerm: string,
  opts: {
    limit?: number;
    agencyId?: string | null;
    clientIdsFilter?: Array<string> | null;
  } = {},
) {
  const limit = Math.min(Math.max(opts.limit || 20, 1), 50);
  const terms = expandClientSearchTerms(searchTerm);
  if (!terms.length || !accessibleTenantIds.length) {
    return [];
  }

  const orName = terms
    .map((t) => t.replace(/[%_,]/g, ""))
    .filter(Boolean)
    .flatMap((t) => [`name.ilike.%${t}%`, `contact_name.ilike.%${t}%`])
    .join(",");

  let clientQ = supabase
    .from("clients")
    .select(
      "id, name, contact_name, phone, status, agency_id, tenant_id, meta_ads_account_id, agencies(name)",
    )
    .in("tenant_id", accessibleTenantIds)
    .or(orName)
    .limit(limit);
  if (opts.agencyId) {
    clientQ = clientQ.eq("agency_id", opts.agencyId);
  }
  if (opts.clientIdsFilter?.length) {
    clientQ = clientQ.in("id", opts.clientIdsFilter);
  }
  const { data: byName, error: nameErr } = await clientQ;
  if (nameErr) {
    throw nameErr;
  }

  // Also match Facebook report tables / ad account names (e.g. "Yael Kernelios LTD").
  const tableOr = terms
    .map((t) => t.replace(/[%_,]/g, ""))
    .filter(Boolean)
    .flatMap((t) => [
      `name.ilike.%${t}%`,
      `integration_settings->>ad_account_name.ilike.%${t}%`,
    ])
    .join(",");
  let tablesQ = supabase
    .from("crm_tables")
    .select(
      "id, name, client_id, integration_type, integration_settings, clients(id, name, contact_name, phone, status, agency_id, tenant_id, meta_ads_account_id, agencies(name))",
    )
    .in("tenant_id", accessibleTenantIds)
    .in("integration_type", [
      "facebook_insights",
      "facebook_ecommerce",
      "google_ads",
    ])
    .or(tableOr)
    .limit(limit);
  if (opts.clientIdsFilter?.length) {
    tablesQ = tablesQ.in("client_id", opts.clientIdsFilter);
  }
  const { data: byTable } = await tablesQ;

  const byId = new Map<string, SearchClient>();
  for (const c of byName || []) {
    byId.set(c.id, {
      id: c.id,
      name: c.name,
      contact_name: c.contact_name,
      phone: c.phone,
      status: c.status,
      agency_id: c.agency_id,
      agency_name: c.agencies?.name ?? null,
      tenant_id: c.tenant_id,
      meta_ads_account_id: c.meta_ads_account_id,
      matched_via: ["client_name"],
      ad_accounts: [],
    });
  }
  for (const t of byTable || []) {
    const c = t.clients;
    if (!c?.id) {
      continue;
    }
    if (opts.agencyId && c.agency_id !== opts.agencyId) {
      continue;
    }
    const settings = readReportSettings(t.integration_settings);
    const adAccount = {
      table_id: t.id,
      table_name: t.name,
      integration_type: t.integration_type,
      ad_account_id: settings.ad_account_id || settings.account_id || null,
      ad_account_name: settings.ad_account_name || null,
      account_status: settings.account_status || null,
    };
    const existing = byId.get(c.id);
    if (existing) {
      existing.matched_via = Array.from(
        new Set([
          ...(existing.matched_via || []),
          "ad_account_or_report_table",
        ]),
      );
      existing.ad_accounts.push(adAccount);
    } else {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        contact_name: c.contact_name,
        phone: c.phone,
        status: c.status,
        agency_id: c.agency_id,
        agency_name: c.agencies?.name ?? null,
        tenant_id: c.tenant_id,
        meta_ads_account_id: c.meta_ads_account_id,
        matched_via: ["ad_account_or_report_table"],
        ad_accounts: [adAccount],
      });
    }
  }

  // Prefer active, then onboarding, then ended/paused — but always return duplicates.
  const statusRank: Record<string, number> = {
    active: 0,
    onboarding: 1,
    paused: 2,
    ended: 3,
  };
  return Array.from(byId.values())
    .sort(
      (a, b) =>
        (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
        String(a.name).localeCompare(String(b.name), "he"),
    )
    .slice(0, limit);
}
