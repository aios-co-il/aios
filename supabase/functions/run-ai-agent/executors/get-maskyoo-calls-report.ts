import type { GetMaskyooCallsReportArgs } from "./messaging-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";

/** Preserves the existing get_maskyoo_calls_report executor and side-effect order. */
export async function executeGetMaskyooCallsReport(
  args: GetMaskyooCallsReportArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const {
    client_id: argClientId,
    client_name,
    period_start,
    period_end,
    category,
    period_compare,
  } = args;

  // Resolve period — default to current month
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultEnd = now.toISOString().split("T")[0];
  const pStart = period_start || defaultStart;
  const pEnd = period_end || defaultEnd;

  // Resolve client_id by name if not given
  const db: AgentDatabaseClient = supabase;
  let resolvedClientId = argClientId;
  if (!resolvedClientId && client_name) {
    const { data: found } = await db
      .from("clients")
      .select("id, name")
      .in("tenant_id", accessibleTenantIds)
      .ilike("name", `%${client_name}%`)
      .limit(5);
    if (!found?.length) {
      return { error: `לא נמצא לקוח בשם "${client_name}"` };
    }
    if (found.length > 1) {
      return {
        ambiguous: true,
        matches: found.map((c) => ({ id: c.id, name: c.name })),
        message: "נמצאו מספר לקוחות — ציין client_id",
      };
    }
    resolvedClientId = found[0].id;
  }

  // Query seo_call_snapshots for given period
  const snapshotQuery = db
    .from("seo_call_snapshots")
    .select(
      "client_id, category, period_start, period_end, incoming_count, is_manual, note, synced_at",
    )
    .in("tenant_id", accessibleTenantIds)
    .gte("period_start", pStart)
    .lte("period_end", pEnd);
  if (resolvedClientId) {
    snapshotQuery.eq("client_id", resolvedClientId);
  }
  if (category && category !== "all") {
    snapshotQuery.eq("category", category);
  }

  const { data: snapshots, error: snapErr } = await snapshotQuery.order(
    "period_start",
    { ascending: false },
  );
  if (snapErr) {
    return { error: snapErr.message };
  }

  // Enrich with client names
  const clientIds = [...new Set((snapshots || []).map((s) => s.client_id))];
  const clientNames: Record<string, string> = {};
  if (clientIds.length) {
    const { data: clients } = await db
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    clients?.forEach((c) => {
      clientNames[c.id] = c.name;
    });
  }

  const rows = (snapshots || []).map((s) => ({
    client_id: s.client_id,
    client_name: clientNames[s.client_id] || s.client_id,
    category: s.category,
    period: `${s.period_start} → ${s.period_end}`,
    incoming_calls: s.incoming_count,
    is_manual: s.is_manual,
    note: s.note,
    last_sync: s.synced_at,
  }));

  // Optional: compare with previous period of same length
  let prevRows: Array<{
    client_id: string;
    category: string;
    incoming_calls: number;
    period: string;
  }> = [];
  if (period_compare) {
    const startDate = new Date(pStart);
    const endDate = new Date(pEnd);
    const diffMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 86400000)
      .toISOString()
      .split("T")[0];
    const prevStart = new Date(startDate.getTime() - diffMs - 86400000)
      .toISOString()
      .split("T")[0];

    const prevQuery = db
      .from("seo_call_snapshots")
      .select("client_id, category, incoming_count")
      .in("tenant_id", accessibleTenantIds)
      .gte("period_start", prevStart)
      .lte("period_end", prevEnd);
    if (resolvedClientId) {
      prevQuery.eq("client_id", resolvedClientId);
    }
    if (category && category !== "all") {
      prevQuery.eq("category", category);
    }
    const { data: prev } = await prevQuery;
    prevRows = (prev || []).map((p) => ({
      client_id: p.client_id,
      category: p.category,
      incoming_calls: p.incoming_count,
      period: `${prevStart} → ${prevEnd}`,
    }));
  }

  return {
    period: `${pStart} → ${pEnd}`,
    total_snapshots: rows.length,
    results: rows,
    previous_period: prevRows.length ? prevRows : undefined,
  };
}
