// A flow's delay step (AIO-611). A short delay waits inside the run; a longer
// one pauses the run in automation_delayed_runs, and automation-delay-worker
// starts the steps after the delay when the time comes.
import type { RunCaller } from "../_shared/automation-run-auth.ts";
import {
  type LeadStatusGuard,
  leadStatusGuard,
} from "../_shared/automation-delay/status-guard.ts";

/** The longest delay a run waits out itself; longer delays pause the run. */
export const MAX_INLINE_DELAY_MS = 30_000;

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

/** A delay step's settings. The editor writes `delay_value`; `delay_amount` is the older key. */
export type DelayStepConfig = {
  delay_value?: unknown;
  delay_amount?: unknown;
  delay_unit?: unknown;
  delay_require_same_status?: unknown;
};

/** A delay step's length in milliseconds: at least one unit, minutes by default. */
export function delayMs(config: DelayStepConfig): number {
  const amount = Number(config.delay_value ?? config.delay_amount);
  const unitMs = UNIT_MS[String(config.delay_unit)] ?? UNIT_MS.minutes;
  return (Number.isFinite(amount) && amount > 0 ? amount : 1) * unitMs;
}

/** An edge of the flow graph, as trigger-automation builds it. */
type FlowEdge = { targetId: string };

/** Every step reachable from `stepId`, without `stepId` itself. */
export function stepsAfter(
  outEdges: Record<string, Array<FlowEdge>>,
  stepId: string,
): Set<string> {
  const reached = new Set<string>();
  const queue = [stepId];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const edge of outEdges[next] || []) {
      if (reached.has(edge.targetId)) {
        continue;
      }
      reached.add(edge.targetId);
      queue.push(edge.targetId);
    }
  }
  return reached;
}

/** The request fields automation-delay-worker sends to resume a paused run. */
type ResumeRequestBody = {
  _resume_delay_step_id?: unknown;
  tenant_id?: unknown;
};

/**
 * The delay step a request resumes after, or null for an ordinary run. Only the
 * service role may resume: the field would let a caller skip a flow's first steps.
 */
export function resumeDelayStepId(
  requestBody: ResumeRequestBody | null,
  caller: RunCaller | null,
): string | null {
  const stepId = requestBody?._resume_delay_step_id;
  if (caller?.kind !== "service") {
    return null;
  }
  return typeof stepId === "string" && stepId ? stepId : null;
}

/** The status guard a delay step asks for, or null when it resumes unconditionally. */
export function delayStatusGuard(
  config: DelayStepConfig,
  payload: Record<string, unknown>,
): LeadStatusGuard | null {
  return config.delay_require_same_status === true
    ? leadStatusGuard(payload)
    : null;
}
