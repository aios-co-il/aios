import {
  DEVICE_CARD_LIFE_MS,
  type DeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";

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
};

/** How a wait for the panel ended. */
export type PanelStepEnd = "result" | "timeout" | "stopped";

/**
 * How long the chat waits for the panel. After a refused claim the panel posts nothing, so
 * the chat ends the wait itself: the card's life, plus a margin for a completion still on
 * its way. By then the server treats the step as expired.
 */
export const STEP_WAIT_MS = DEVICE_CARD_LIFE_MS + 15_000;

/**
 * Hands one step to the panel and waits until the panel reports it complete, the wait runs
 * out, or the user stops the run. A timeout or a stop also tells the panel to drop the step.
 * A stop before anything was posted posts nothing.
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
    const unsubscribe = panel.onResult(onResult);
    const timer = setTimeout(() => settle("timeout"), waitMs);
    signal.addEventListener("abort", onAbort, { once: true });
    panel.postAction(actionId);

    /** A completed step: this wait's, or another one's. */
    function onResult(completed: string) {
      if (completed === actionId) {
        settle("result");
      }
    }

    /** Ends the wait once, whatever ends it first. */
    function settle(end: PanelStepEnd) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      if (end !== "result") {
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
