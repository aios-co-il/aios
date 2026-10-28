/**
 * The ad accounts the monitor watches: those of the tenant's active Meta report
 * tables (`campaign_active` not false) that belong to a client. An account that
 * no active report uses is not scanned, so a former client's account raises
 * nothing.
 */
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { ReportAccount } from "./types.ts";

export const META_REPORT_TABLE_TYPES = [
  "facebook_insights",
  "facebook_ecommerce",
];

/**
 * One entry per ad account. Two clients on one account would share every
 * finding, so the account goes to the first client by name and the overlap is
 * logged.
 */
export async function loadReportAccounts(
  db: Pick<DbClient, "from">,
  tenantId: string,
): Promise<ReportAccount[]> {
  const { data: tables, error } = await db
    .from("crm_tables")
    .select("id, client_id, integration_settings, campaign_active")
    .eq("tenant_id", tenantId)
    .in("integration_type", META_REPORT_TABLE_TYPES)
    .not("client_id", "is", null);
  if (error) {
    throw new Error(`report tables read failed: ${error.message}`);
  }
  const candidates: Omit<ReportAccount, "clientName">[] = [];
  for (const table of tables || []) {
    if (table.campaign_active === false || !table.client_id) {
      continue;
    }
    const settings = settingsOf(table.integration_settings);
    const adAccountId = graphAccountId(settings.ad_account_id);
    if (!adAccountId) {
      continue;
    }
    candidates.push({
      adAccountId,
      clientId: table.client_id,
      integrationId:
        stringOrNull(settings.integration_id) ||
        stringOrNull(settings.integrationId),
    });
  }
  if (!candidates.length) {
    return [];
  }

  const clientIds = [...new Set(candidates.map((c) => c.clientId))];
  const { data: clients, error: clientsError } = await db
    .from("clients")
    .select("id, name")
    .in("id", clientIds);
  if (clientsError) {
    throw new Error(`clients read failed: ${clientsError.message}`);
  }
  const names = new Map((clients || []).map((c) => [c.id, c.name]));

  const byAccount = new Map<string, ReportAccount>();
  for (const candidate of candidates) {
    const report: ReportAccount = {
      ...candidate,
      clientName: names.get(candidate.clientId) ?? null,
    };
    const existing = byAccount.get(report.adAccountId);
    if (!existing) {
      byAccount.set(report.adAccountId, report);
      continue;
    }
    if (existing.clientId !== report.clientId) {
      console.warn(
        "[fb-campaign-monitor] ad account on two clients' active reports",
        report.adAccountId,
        existing.clientId,
        report.clientId,
      );
      if ((report.clientName || "") < (existing.clientName || "")) {
        byAccount.set(report.adAccountId, report);
      }
    }
  }
  return [...byAccount.values()];
}

/** `act_<id>` for a stored ad account id, bare or prefixed; null when blank. */
export function graphAccountId(value: unknown): string | null {
  const id =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isInteger(value)
        ? String(value)
        : "";
  if (!id) {
    return null;
  }
  return id.startsWith("act_") ? id : `act_${id}`;
}

function settingsOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
