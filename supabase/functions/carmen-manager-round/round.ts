/**
 * One call of the manager round: every tenant whose mode is not 'off' (or the
 * one the request names), least recently run first, each within a slice of a
 * shared time and API budget. Tenants left over run on the next call.
 */
import { resolveManagerSettings } from "../_shared/manager-round/settings.ts";
import { RoundBudget } from "./budget.ts";
import type { RoundDeps } from "./deps.ts";
import type { RoundRequest } from "./request.ts";
import type { TenantRow } from "./state/store.ts";
import { runTenant, type TenantReport } from "./tenant-run.ts";

/** New work (tenants, collectors) stops here, under the cron's 150 s timeout. */
export const ROUND_BUDGET_MS = 110_000;
/** Sends end by then; one starts only with SEND_RESERVE_MS of it left. */
export const SEND_WINDOW_MS = 140_000;
const ROUND_API_CALLS = 200;
const TENANT_SLICE_MS = 45_000;
const MIN_TENANT_MS = 8_000;

export type RoundReport = {
  round_id: string;
  dry_run: boolean;
  tenants: TenantReport[];
};

/** Runs every due tenant within the call's budget and reports each one. */
export async function runRound(
  deps: RoundDeps,
  request: RoundRequest,
): Promise<RoundReport> {
  const roundId = crypto.randomUUID();
  const budget = RoundBudget.create(ROUND_BUDGET_MS, ROUND_API_CALLS);
  const sendBudget = RoundBudget.create(SEND_WINDOW_MS, 0);
  const tenants = tenantsToRun(await deps.state.listTenants(), request);
  const reports: TenantReport[] = [];
  for (const tenant of tenants) {
    const mode = resolveManagerSettings(tenant.pulse_alert_rules).mode;
    if (!budget.hasTime(MIN_TENANT_MS)) {
      reports.push({ tenant_id: tenant.tenant_id, mode, skipped: "budget" });
      continue;
    }
    try {
      reports.push(
        await runTenant(deps, tenant, {
          roundId,
          budget: budget.slice(TENANT_SLICE_MS),
          sendBudget,
          request,
        }),
      );
    } catch (error) {
      reports.push({
        tenant_id: tenant.tenant_id,
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { round_id: roundId, dry_run: request.dryRun, tenants: reports };
}

/** The named tenant, or every tenant not switched off; never-run and oldest first. */
export function tenantsToRun(
  tenants: TenantRow[],
  request: Pick<RoundRequest, "tenantId">,
): TenantRow[] {
  const chosen = request.tenantId
    ? tenants.filter((tenant) => tenant.tenant_id === request.tenantId)
    : tenants.filter(
        (tenant) =>
          resolveManagerSettings(tenant.pulse_alert_rules).mode !== "off",
      );
  return [...chosen].sort((a, b) => lastRun(a) - lastRun(b));
}

/** Last round time in ms; 0 for a tenant never run. */
function lastRun(tenant: TenantRow): number {
  return tenant.last_run_at ? Date.parse(tenant.last_run_at) : 0;
}
