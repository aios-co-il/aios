import {
  DEVICE_STEPS_PER_MESSAGE,
  type DeviceActionReply,
} from "@functions/_shared/carmen/device/contract.ts";
import type { PanelClaimFailure } from "@functions/_shared/carmen/device/panel-envelope.ts";
import {
  isClaimFailure,
  type PanelChannel,
  runPanelStep,
  STEP_WAIT_MS,
} from "./panelStep";

/** What a continuation request told the chat about the run. */
export type ContinuedReply = {
  /** The next step the run waits on, or null when the answer is complete. */
  deviceAction: DeviceActionReply | null;
  /** The server refused the continuation (409 `device_step_unavailable`). */
  unavailable: boolean;
};

/** How a chain of browser steps ended; a claim failure names why the panel could not take the step. */
export type StepChainEnd =
  "answered" | "unavailable" | "stopped" | "limit" | PanelClaimFailure;

export type StepChainDeps = {
  panel: PanelChannel;
  /** Aborted by the chat's Stop. */
  signal: AbortSignal;
  /** After a Stop: whether the server now holds the run's stop, so a continuation gets the stop line. */
  stopRecorded: () => Promise<boolean>;
  /** Sends the continuation for a reported step and streams its answer. */
  continueRun: (actionId: string) => Promise<ContinuedReply>;
  /** The step the chat waits on the panel for, or null once the wait ends. */
  onWaiting: (actionId: string | null) => void;
  /** The panel said nothing within the wait; called before the run continues. */
  onTimeout: () => void;
  waitMs?: number;
};

/**
 * Runs the browser steps one typed message leads to (AIO-656): each step goes to the panel,
 * and once the panel reports it (or the wait runs out) the run continues on the server,
 * which may answer or wait on the next step, up to the contract's steps per message.
 *
 * After a Stop the run continues only once the stop is recorded, so the server answers with
 * the stop line instead of a model turn; if the stop could not be recorded, nothing more is
 * sent and the step closes on the server with the next typed message.
 *
 * A step the panel could not claim ends the chain at once and continues nothing: the row is
 * still pending, so the server would refuse the continuation; it expires, or the next typed
 * message closes it. A panel that says nothing within the wait is reported (`onTimeout`)
 * and the run continues, so the server closes the step as expired and answers.
 */
export async function runBrowserSteps(
  first: DeviceActionReply,
  deps: StepChainDeps,
): Promise<StepChainEnd> {
  let action: DeviceActionReply | null = first;
  let steps = 0;

  while (action) {
    if (steps >= DEVICE_STEPS_PER_MESSAGE) {
      console.warn(
        `[carmen-device] the server asked for step ${steps + 1}; the limit is ${DEVICE_STEPS_PER_MESSAGE}`,
      );
      return "limit";
    }
    steps += 1;

    const waited = await waitForPanel(action.action_id, deps);
    if (isClaimFailure(waited)) {
      return waited;
    }
    if (waited === "timeout") {
      deps.onTimeout();
    }
    if (waited === "stopped" && !(await deps.stopRecorded())) {
      return "stopped";
    }
    const reply = await deps.continueRun(action.action_id);

    if (reply.unavailable) {
      return "unavailable";
    }
    if (waited === "stopped") {
      return "stopped";
    }
    action = reply.deviceAction;
  }
  return "answered";
}

/** One wait for the panel, with the chat's waiting state on around it. */
async function waitForPanel(actionId: string, deps: StepChainDeps) {
  deps.onWaiting(actionId);
  try {
    return await runPanelStep(
      deps.panel,
      actionId,
      deps.signal,
      deps.waitMs ?? STEP_WAIT_MS,
    );
  } finally {
    deps.onWaiting(null);
  }
}
