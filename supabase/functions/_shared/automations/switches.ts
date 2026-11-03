/**
 * Per-org switches for Carmen's automations (AIO-314). A worker asks before
 * it acts for an org; a missing row means on, so an org that never touched
 * the screen keeps today's behaviour. The keys live in ./keys.ts.
 */
import type { DbClient } from "../supabase-clients.ts";
import type { AutomationKey } from "./keys.ts";

/** The orgs among `tenantIds` that switched `key` off. */
export async function tenantsWithAutomationOff(
  sb: Pick<DbClient, "from">,
  key: AutomationKey,
  tenantIds: Array<string>,
): Promise<Set<string>> {
  const ids = [...new Set(tenantIds)];
  if (!ids.length) {
    return new Set();
  }
  const { data, error } = await sb
    .from("carmen_automation_settings")
    .select("tenant_id")
    .eq("automation_key", key)
    .eq("enabled", false)
    .in("tenant_id", ids);
  if (error) {
    throw new Error(`automation switches read failed: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.tenant_id));
}

/** Whether the org has `key` on (no row counts as on). */
export async function automationEnabled(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  key: AutomationKey,
): Promise<boolean> {
  const off = await tenantsWithAutomationOff(sb, key, [tenantId]);
  return !off.has(tenantId);
}

/** The logged skip, so a switched-off org is visible in the function logs. */
export function logAutomationOff(
  fn: string,
  key: AutomationKey,
  tenantIds: Iterable<string>,
): void {
  const list = [...tenantIds];
  if (list.length) {
    console.log(`[${fn}] ${key} is off for ${list.length} org(s)`, list);
  }
}
