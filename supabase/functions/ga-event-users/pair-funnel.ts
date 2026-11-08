/**
 * The dashboard's conversion pair as GA's two-step closed funnel, so the
 * second count only includes people who did the first event.
 */
import { funnelStepUsers, type GaRow, type PairUsers } from "./reports.ts";
import type { TrackedEvent } from "./tracked-events.ts";
import type { TrackedRatio } from "./tracked-ratio.ts";

/** The pair's two events as a two-step funnel, or null without a pair. */
export function pairStepsOf(
  steps: Array<TrackedEvent>,
  ratio: TrackedRatio | null,
): Array<TrackedEvent> | null {
  const from = steps.find((step) => step.event === ratio?.from);
  const to = steps.find((step) => step.event === ratio?.to);
  return from && to ? [from, to] : null;
}

/** People at the pair's first step and, of them, at its second. */
export function pairUsers(
  rows: Array<GaRow>,
  pairSteps: Array<TrackedEvent>,
): PairUsers {
  const users = funnelStepUsers(rows, pairSteps, false).get("") ?? {};
  return {
    fromEvent: pairSteps[0].event,
    toEvent: pairSteps[1].event,
    from: users[pairSteps[0].event] ?? 0,
    to: users[pairSteps[1].event] ?? 0,
  };
}
