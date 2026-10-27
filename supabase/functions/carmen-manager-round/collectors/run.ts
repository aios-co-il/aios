/**
 * Runs one tenant's due collectors within its time budget: check the trigger,
 * claim the cron slot, collect, upsert the candidates, auto-clear what a
 * complete run no longer reports, and store the watermark only after
 * success. A dry run only collects.
 */
import type { Json } from "../../_shared/database.types.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { RoundBudget } from "../budget.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { RoundStateRow, RoundStateStore } from "../state/store.ts";
import { collectorContext } from "./context.ts";
import { persistRun } from "./persist.ts";
import type { DueCollector } from "./registry.ts";
import type { Collector, CollectorContext, FindingCandidate } from "./types.ts";

export type CollectorRunDeps = {
  state: RoundStateStore;
  findings: FindingsStore;
  db: DbClient;
};

export type CollectorRunInput = {
  tenantId: string;
  roundId: string;
  settings: ManagerSettings;
  now: Date;
  budget: RoundBudget;
  state: RoundStateRow[];
  due: DueCollector[];
  clientIds: string[] | null;
  fixtures: Json | null;
  dryRun: boolean;
};

export type CollectorReport = {
  id: string;
  status: "ok" | "skipped" | "error";
  candidates: number;
  inserted: number;
  cleared: number;
  llm: { calls: number; costUsd: number };
  reason?: string;
};

/** Below this much time left, a collector waits for the next round. */
const MIN_COLLECTOR_MS = 5_000;

/** Runs the due collectors in order until the budget runs low. */
export async function runCollectors(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
): Promise<{ reports: CollectorReport[]; candidates: FindingCandidate[] }> {
  const reports: CollectorReport[] = [];
  const candidates: FindingCandidate[] = [];
  for (const due of input.due) {
    if (!input.budget.hasTime(MIN_COLLECTOR_MS)) {
      reports.push(report(due.collector, "skipped", { reason: "budget" }));
      continue;
    }
    const outcome = await runOne(deps, input, due);
    reports.push(outcome.report);
    candidates.push(...outcome.candidates);
  }
  return { reports, candidates };
}

/** One collector run; a failure is reported and stored, never thrown. */
async function runOne(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
  due: DueCollector,
): Promise<{ report: CollectorReport; candidates: FindingCandidate[] }> {
  const { collector } = due;
  const ctx = collectorContext(deps, input, collector);
  try {
    const skip = await skipReason(deps, input, due, ctx);
    if (skip) {
      return {
        report: report(collector, "skipped", { reason: skip }),
        candidates: [],
      };
    }
    const result = await collector.collect(ctx);
    // A collector reports only the kinds it declares.
    const candidates = result.candidates.filter((c) =>
      collector.kinds.includes(c.kind),
    );
    const stored = input.dryRun
      ? { inserted: 0, cleared: 0 }
      : await persistRun(deps, input, collector, result, candidates);
    const fields = {
      candidates: candidates.length,
      ...stored,
      llm: result.llm,
      ...(result.note ? { reason: result.note } : {}),
    };
    return { report: report(collector, "ok", fields), candidates };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!input.dryRun) {
      await deps.state.saveCollectorState(input.tenantId, collector.id, {
        ok: false,
        error: reason,
      });
    }
    return { report: report(collector, "error", { reason }), candidates: [] };
  }
}

/** Not triggered, or another call already took this cron slot. */
async function skipReason(
  deps: CollectorRunDeps,
  input: CollectorRunInput,
  due: DueCollector,
  ctx: CollectorContext,
): Promise<string | null> {
  const { schedule, id } = due.collector;
  if ("trigger" in schedule && !(await schedule.trigger(ctx))) {
    return "not_triggered";
  }
  const taken =
    !input.dryRun &&
    !!due.slot &&
    !(await deps.state.claimSlot(input.tenantId, id, due.slot));
  return taken ? "slot_taken" : null;
}

/** A collector report with zero counts by default. */
function report(
  collector: Collector,
  status: CollectorReport["status"],
  fields: Partial<CollectorReport>,
): CollectorReport {
  return {
    id: collector.id,
    status,
    candidates: 0,
    inserted: 0,
    cleared: 0,
    ...fields,
    llm: fields.llm ?? { calls: 0, costUsd: 0 },
  };
}
