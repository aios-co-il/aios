import {
  DEVICE_CARD_LIFE_MS,
  type DeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";
import {
  PANEL_CLAIM_FAILURES,
  type PanelClaimFailure,
} from "@functions/_shared/carmen/device/panel-envelope.ts";

/**
 * The chat's line to the extension's side panel that frames it: what the panel announced,
 * and the action messages. It exists only while the panel frames this page, and it reads
 * results only from that panel's exact origin and window.
 */
export type PanelChannel = {
  /** The device tools the panel's latest capabilities message named. */
  tools: ReadonlyArray<DeviceToolName>;
  /** Asks the panel to claim the step and act. */
  postAction: (actionId: string) => void;
  /** Tells the panel to drop the step and its card. */
  postCancel: (actionId: string) => void;
  /** Calls the listener with each completed step's id; returns the unsubscribe. */
  onResult: (listener: (actionId: string) => void) => () => void;
  /** Calls the listener with each step the panel could not claim, and why; returns the unsubscribe. */
  onClaimFailed: (listener: ClaimFailedListener) => () => void;
};

/** Hears that the panel could not claim a step, and why. */
export type ClaimFailedListener = (
  actionId: string,
  failure: PanelClaimFailure,
) => void;

/** How a wait for the panel ended: a result, the panel's failed claim (why), the wait running out, or a Stop. */
export type PanelStepEnd = "result" | "timeout" | "stopped" | PanelClaimFailure;

/**
 * How long the chat waits for the panel when it hears nothing at all (a panel that closed,
 * or a build that does not say when a claim fails): the card's life, plus a margin for a
 * completion still on its way. By then the server treats the step as expired.
 */
export const STEP_WAIT_MS = DEVICE_CARD_LIFE_MS + 15_000;

/** Whether a wait ended because the panel could not claim the step. */
export function isClaimFailure(end: string): end is PanelClaimFailure {
  return PANEL_CLAIM_FAILURES.some((failure) => failure === end);
}

/**
 * Hands one step to the panel and waits until the panel reports it complete or could not
 * claim it, the wait runs out, or the user stops the run. A timeout or a stop also tells
 * the panel to drop the step. A stop before anything was posted posts nothing.
 */
export function runPanelStep(
  panel: PanelChannel,
  actionId: string,
  signal: AbortSignal,
  waitMs: number = STEP_WAIT_MS,
): Promise<PanelStepEnd> {
  if (signal.aborted) {
    return Promise.resolve("stopped");
  }
  return new Promise((resolve) => {
    let settled = false;
    // Listen before posting, so a fast panel's result is never missed.
    const unsubscribeResult = panel.onResult(onResult);
    const unsubscribeClaim = panel.onClaimFailed(onClaimFailed);
    const timer = setTimeout(() => settle("timeout"), waitMs);
    signal.addEventListener("abort", onAbort, { once: true });
    panel.postAction(actionId);

    /** A completed step: this wait's, or another one's. */
    function onResult(completed: string) {
      if (completed === actionId) {
        settle("result");
      }
    }

    /** A step the panel could not claim: this wait's, or another one's. */
    function onClaimFailed(failed: string, failure: PanelClaimFailure) {
      if (failed === actionId) {
        settle(failure);
      }
    }

    /** Ends the wait once, whatever ends it first. */
    function settle(end: PanelStepEnd) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribeResult();
      unsubscribeClaim();
      signal.removeEventListener("abort", onAbort);
      // A panel that could not claim the step holds nothing to drop.
      if (end === "timeout" || end === "stopped") {
        panel.postCancel(actionId);
      }
      resolve(end);
    }

    /** The user pressed Stop. */
    function onAbort() {
      settle("stopped");
    }
  });
}
