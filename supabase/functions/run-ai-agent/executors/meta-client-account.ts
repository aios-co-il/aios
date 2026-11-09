import type { AgentDatabaseClient } from "../database-contracts.ts";
import { fbResolveClientMetaReport } from "./meta-client-report.ts";

// ===========================
// ALL AVAILABLE TOOLS
// ===========================

// ===========================
// TOOL EXECUTOR
// ===========================

// ── Live Meta (Facebook) reads ──────────────────────────────────────────────
// The campaigner skill demands a LIVE audit before recommending, but the synced
// CRM tables can lag (some accounts were stuck months behind). These helpers read
// straight from the Graph API so list/get tools reflect the real account state,
// with a synced-table fallback so nothing regresses when live read isn't possible.

/** Retains the existing fbResolveClientAdAccount behavior. */
export async function fbResolveClientAdAccount(
  supabase: AgentDatabaseClient,
  tenantId: string,
  clientId: string,
): Promise<string | null> {
  return (
    (await fbResolveClientMetaReport(supabase, tenantId, clientId))?.account ??
    null
  );
}
