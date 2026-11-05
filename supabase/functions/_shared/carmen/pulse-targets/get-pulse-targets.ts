import { PULSE_AD_INTEGRATION_TYPES } from "../../pulse/platforms.ts";
import { pulseTargetSourceLabel } from "../../pulse/targets/kinds.ts";
import { summarizePulseTargets } from "../../pulse/targets/summary.ts";
import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import { latestCampaignRows } from "./snapshot-rows.ts";

/**
 * get_pulse_targets: what each client has (source, rationale, date) and which
 * spending campaigns have no target, most uncovered spend first. The reads are
 * capped; `truncated` and `note` say when a cap cut the answer.
 */
export async function getPulseTargets(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
) {
  const clientIds = await requestedClientIds(db, ctx, args);
  if (clientIds && !Array.isArray(clientIds)) {
    return clientIds;
  }
  if (clientIds && !clientIds.length) {
    return { clients: [], missing_count: 0, note: "אין לקוחות בהרשאה שלך" };
  }
  const read = await adTables(db, ctx, clientIds);
  const ids = [
    ...new Set(read.tables.flatMap((t) => (t.client_id ? [t.client_id] : []))),
  ].slice(0, MAX_CLIENT_IDS);
  const readIds = new Set(ids);
  const tables = read.tables.filter(
    (t) => t.client_id !== null && readIds.has(t.client_id),
  );
  const partial = read.partial || tables.length < read.tables.length;
  const campaignRows = await latestCampaignRows(db, ctx, ids);
  const summary = summarizePulseTargets({ tables, campaignRows });
  const sorted = summary.clients.sort(
    (a, b) => missingSpend(b.missing) - missingSpend(a.missing),
  );
  const shown = sorted.slice(0, MAX_CLIENTS_RETURNED);
  const nameById = await clientNames(
    db,
    ctx,
    shown.flatMap((client) =>
      typeof client.client_id === "string" ? [client.client_id] : [],
    ),
  );
  return {
    clients: shown.map((client) => ({
      client_name: nameById.get(client.client_id) || null,
      ...client,
    })),
    clients_total: sorted.length,
    missing_count: summary.missing_count,
    truncated: partial || sorted.length > MAX_CLIENTS_RETURNED,
    ...(partial ? { note: PARTIAL_NOTE } : {}),
    sources: {
      approved: `${pulseTargetSourceLabel("approved")} — אדם קבע`,
      carmen_market: `${pulseTargetSourceLabel("carmen_market")} — הערכה של כרמן; מפעיל התראות כמו מאושר`,
    },
  };
}

const MAX_CLIENTS_RETURNED = 40;

/** The most report tables, and clients, one call reads. */
const MAX_TABLES = 1000;
const MAX_CLIENT_IDS = 500;

const PARTIAL_NOTE = `נקראו עד ${MAX_TABLES} טבלאות ו־${MAX_CLIENT_IDS} לקוחות, ולכן התשובה חלקית. לתמונה מלאה של לקוח — ציינו client_id.`;

/**
 * The clients to report on: the one asked for (after an access check), every
 * client for a manager (null), a team manager's agencies' clients, or a
 * campaigner's own clients.
 */
async function requestedClientIds(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
): Promise<string[] | null | { error: string }> {
  const requested = String(args.client_id ?? "").trim();
  if (requested) {
    await ctx.assertClientAccess(requested);
    return [requested];
  }
  if (ctx.isManagerRole) {
    return null;
  }
  if (ctx.isTeamManager && ctx.managedAgencyIds.length) {
    const { data, error } = await db
      .from("clients")
      .select("id")
      .in("agency_id", ctx.managedAgencyIds)
      .in("tenant_id", ctx.accessibleTenantIds);
    if (error) {
      throw error;
    }
    return (data || []).map((row) => row.id);
  }
  if (ctx.callerCampaignerId) {
    const { data, error } = await db
      .from("client_team")
      .select("client_id")
      .eq("campaigner_id", ctx.callerCampaignerId);
    if (error) {
      throw error;
    }
    return [...new Set((data || []).map((row) => row.client_id))];
  }
  return { error: "ציינו client_id — אין לך שיוך ללקוחות" };
}

/**
 * The ad report tables of these clients (all clients when null) in the caller's
 * tenants; `partial` when a cap may have left some out.
 */
async function adTables(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  clientIds: string[] | null,
) {
  let query = db
    .from("crm_tables")
    .select("id, client_id, integration_type, integration_settings")
    .in("tenant_id", ctx.accessibleTenantIds)
    .in("integration_type", [...PULSE_AD_INTEGRATION_TYPES])
    .not("client_id", "is", null)
    .limit(MAX_TABLES);
  if (clientIds) {
    query = query.in("client_id", clientIds.slice(0, MAX_CLIENT_IDS));
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const tables = data || [];
  return {
    tables,
    partial:
      tables.length >= MAX_TABLES || (clientIds?.length ?? 0) > MAX_CLIENT_IDS,
  };
}

/** The names of the clients shown, read in the caller's tenants. */
async function clientNames(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  ids: string[],
): Promise<Map<unknown, string>> {
  if (!ids.length) {
    return new Map();
  }
  const { data, error } = await db
    .from("clients")
    .select("id, name")
    .in("id", ids)
    .in("tenant_id", ctx.accessibleTenantIds);
  if (error) {
    throw error;
  }
  return new Map((data || []).map((client) => [client.id, client.name]));
}

/** The 7-day spend of a client's campaigns without a target. */
function missingSpend(groups: Array<{ spend_7d: number }>): number {
  return groups.reduce((total, group) => total + group.spend_7d, 0);
}
