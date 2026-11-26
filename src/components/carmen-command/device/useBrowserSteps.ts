import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceActionReply } from "@functions/_shared/carmen/device/contract.ts";
import type { PanelChannel } from "./panelStep";
import {
  type ContinuedReply,
  runBrowserSteps,
  type StepChainEnd,
} from "./stepChain";

/**
 * The chat's browser steps (AIO-656): runs a chain when a reply waits on a step, says while
 * it waits for the panel, and ends the wait when the user presses Stop or the chat closes.
 */
export function useBrowserSteps(panel: PanelChannel | null) {
  const [waiting, setWaiting] = useState(false);
  const chainRef = useRef<AbortController | null>(null);
  const stopRef = useRef<Promise<boolean> | null>(null);

  /**
   * Runs the steps a reply led to. Only a reply to a request that announced the step's tool
   * starts one, so a page outside the panel, or a reply to a request that offered nothing,
   * never reaches the panel.
   */
  const run = useCallback(
    async (
      first: DeviceActionReply,
      offered: ReadonlyArray<string> | undefined,
      continueRun: (actionId: string) => Promise<ContinuedReply>,
    ): Promise<StepChainEnd | null> => {
      if (!panel || !offered?.includes(first.tool)) {
        console.warn(
          `[carmen-device] a reply asked for ${first.tool}, which this request did not offer`,
        );
        return null;
      }
      chainRef.current?.abort();
      const chain = new AbortController();
      chainRef.current = chain;
      stopRef.current = null;
      try {
        return await runBrowserSteps(first, {
          panel,
          signal: chain.signal,
          stopRecorded: () => stopRef.current ?? Promise.resolve(false),
          continueRun,
          onWaiting: setWaiting,
        });
      } finally {
        if (chainRef.current === chain) {
          chainRef.current = null;
        }
      }
    },
    [panel],
  );

  /** The user pressed Stop: a waiting step is dropped once the stop is recorded (or not). */
  const stop = useCallback((recorded: Promise<unknown>) => {
    stopRef.current = recorded.then(
      () => true,
      () => false,
    );
    chainRef.current?.abort();
  }, []);

  // A chat that closes mid-step tells the panel to drop it and continues nothing.
  useEffect(() => () => chainRef.current?.abort(), []);

  return { waiting, run, stop };
}
