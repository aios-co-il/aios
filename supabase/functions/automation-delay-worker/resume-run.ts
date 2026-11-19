// Decides what happens to one paused run when its delay ends (AIO-611).
import {
  type LeadStatusRow,
  leadStillInStatus,
  parseLeadStatusGuard,
} from "../_shared/automation-delay/status-guard.ts";
import type { Tables } from "../_shared/database.types.ts";

/** The columns of a claimed wait the worker reads. */
export type PausedRun = Pick<
  Tables<"automation_delayed_runs">,
  | "id"
  | "tenant_id"
  | "automation_id"
  | "delay_step_id"
  | "payload"
  | "status_guard"
>;

/** How a claimed wait ended, as stored on its row. */
export type ResumeResult = {
  status: "resumed" | "cancelled" | "failed";
  outcome: string | null;
};

/** What a resume reads and calls; injected so tests need no database. */
export type ResumeDeps = {
  automationIsActive(automationId: string): Promise<boolean>;
  delayStepExists(automationId: string, stepId: string): Promise<boolean>;
  leadStatus(tenantId: string, leadId: string): Promise<LeadStatusRow | null>;
  /** Runs the steps after the delay; resolves with a skip reason or null. */
  runStepsAfterDelay(run: PausedRun): Promise<string | null>;
};

/**
 * Resumes one paused run, or cancels it when it should no longer run: the
 * automation was switched off or deleted, its delay step was removed, or the
 * lead left the status the delay step guards.
 */
export async function resumePausedRun(
  run: PausedRun,
  deps: ResumeDeps,
): Promise<ResumeResult> {
  try {
    const cancelReason = await reasonToCancel(run, deps);
    if (cancelReason) {
      return { status: "cancelled", outcome: cancelReason };
    }

    const skipReason = await deps.runStepsAfterDelay(run);
    return skipReason
      ? { status: "cancelled", outcome: skipReason }
      : { status: "resumed", outcome: null };
  } catch (error) {
    return {
      status: "failed",
      outcome: error instanceof Error ? error.message : "resume failed",
    };
  }
}

/** Why a paused run must not resume, or null when it should. */
async function reasonToCancel(
  run: PausedRun,
  deps: ResumeDeps,
): Promise<string | null> {
  if (!(await deps.automationIsActive(run.automation_id))) {
    return "automation_inactive";
  }
  if (!(await deps.delayStepExists(run.automation_id, run.delay_step_id))) {
    return "delay_step_removed";
  }
  if (run.status_guard === null) {
    return null;
  }

  // A guard that cannot be read fails closed: the run asked for a check.
  const guard = parseLeadStatusGuard(run.status_guard);
  if (!guard) {
    return "status_guard_unreadable";
  }
  const lead = await deps.leadStatus(run.tenant_id, guard.lead_id);
  return leadStillInStatus(guard, lead) ? null : "lead_status_changed";
}
