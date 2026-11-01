/**
 * One tenant's round: lease, collect, route, brief, dispatch, and one
 * heartbeat_logs row when anything happened. Each tenant runs from its own
 * settings; a tenant in 'off' is skipped, 'observe' only records.
 */
import type { ManagerMode } from "../_shared/manager-round/modes.ts";
import { resolveManagerSettings } from "../_shared/manager-round/settings.ts";
import type { BriefReport } from "./brief/send.ts";
import type { RoundBudget } from "./budget.ts";
import type { CollectorReport } from "./collectors/run.ts";
import type { FindingCandidate } from "./collectors/types.ts";
import type { RoundDeps } from "./deps.ts";
import type { DroppedCounts } from "./findings/dropped.ts";
import type { DispatchReport } from "./dispatch/dispatch.ts";
import type { PreviewMessage } from "./dry-run.ts";
import type { RouteDecision } from "./findings/types.ts";
import { hasActivity, roundLog } from "./heartbeat.ts";
import type { RoundRequest } from "./request.ts";
import type { TenantRow } from "./state/store.ts";
import { runSteps } from "./tenant-steps.ts";

export type TenantReport = {
  tenant_id: string;
  mode: ManagerMode;
  skipped?: "off" | "locked" | "budget";
  error?: string;
  collectors?: CollectorReport[];
  routed?: number;
  gaps?: number;
  /** Routing gaps the database did not store, by outcome. */
  gaps_dropped?: DroppedCounts;
  brief?: BriefReport | null;
  dispatch?: DispatchReport | null;
  preview?: {
    candidates: FindingCandidate[];
    decisions: RouteDecision[];
    messages: PreviewMessage[];
  };
};

export type TenantRun = {
  roundId: string;
  /** This tenant's slice of the call's work budget. */
  budget: RoundBudget;
  /** The call's send window, shared by every tenant (round.ts). */
  sendBudget: RoundBudget;
  request: RoundRequest;
};

/** Longer than one call's budget, so a crashed call frees the tenant soon after. */
const LEASE_SECONDS = 300;

/** Runs one tenant under its lease and logs the run; never throws for a step failure. */
export async function runTenant(
  deps: RoundDeps,
  tenant: TenantRow,
  run: TenantRun,
): Promise<TenantReport> {
  const settings = resolveManagerSettings(tenant.pulse_alert_rules);
  const base: TenantReport = {
    tenant_id: tenant.tenant_id,
    mode: settings.mode,
  };
  const { dryRun } = run.request;
  if (settings.mode === "off") {
    return { ...base, skipped: "off" };
  }
  if (
    !dryRun &&
    !(await deps.state.tryLease(tenant.tenant_id, LEASE_SECONDS))
  ) {
    return { ...base, skipped: "locked" };
  }
  const started = Date.now();
  let failure: string | null = null;
  try {
    const report: TenantReport = {
      ...base,
      ...(await runSteps(deps, tenant.tenant_id, settings, run)),
    };
    if (!dryRun && hasActivity(report)) {
      await deps.state.writeHeartbeat(roundLog(report, Date.now() - started));
    }
    return report;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    if (!dryRun) {
      await deps.state
        .writeHeartbeat(
          roundLog({ ...base, error: failure }, Date.now() - started),
        )
        .catch((logError) =>
          console.error("[carmen-manager-round] heartbeat", logError),
        );
    }
    return { ...base, error: failure };
  } finally {
    if (!dryRun) {
      await deps.state.endLease(tenant.tenant_id, failure);
    }
  }
}
