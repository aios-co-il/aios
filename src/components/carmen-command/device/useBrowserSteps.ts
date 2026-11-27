import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DeviceActionReply,
  DeviceToolName,
} from "@functions/_shared/carmen/device/contract.ts";
import { deviceToolsToSend } from "./deviceRequest";
import type { PanelChannel } from "./panelStep";
import {
  type ContinuedReply,
  runBrowserSteps,
  type StepChainEnd,
} from "./stepChain";

/** The steps one reply led to, and what the request that got it offered. */
export type StepChainStart = {
  first: DeviceActionReply;
  /** The device tools the request offered; a step for any other tool is never run. */
  offered: ReadonlyArray<string> | undefined;
  /** `mark()` taken when the message was sent: a Stop pressed since then holds. */
  since: number;
  /** The panel said nothing within the wait; called before the run continues. */
  onTimeout: () => void;
  /** Continues the run; `tools` is what the panel announces now, so a step after tab sharing went off is not offered. */
  continueRun: (
    actionId: string,
    tools: ReadonlyArray<DeviceToolName> | undefined,
  ) => Promise<ContinuedReply>;
};

/**
 * The chat's browser steps (AIO-656): runs a chain when a reply waits on a step, says while
 * it waits for the panel, and ends the wait when the user presses Stop or the chat closes.
 */
export function useBrowserSteps(panel: PanelChannel | null) {
  const [waitingOn, setWaitingOn] = useState<string | null>(null);
  const waitingOnRef = useRef<string | null>(null);
  const chainRef = useRef<AbortController | null>(null);
  const stopsRef = useRef(0);
  const stopRef = useRef<Promise<boolean> | null>(null);
  const panelRef = useRef(panel);
  panelRef.current = panel;

  /** Counts the Stops so far; a chain started after a Stop since its mark starts stopped. */
  const mark = useCallback(() => stopsRef.current, []);

  /**
   * Runs the steps a reply led to. Only a reply to a request that announced the step's tool
   * starts one, so a page outside the panel, or a reply to a request that offered nothing,
   * never reaches the panel. A Stop pressed before the reply arrived posts nothing.
   */
  const run = useCallback(
    async (start: StepChainStart): Promise<StepChainEnd | null> => {
      if (!panel || !start.offered?.includes(start.first.tool)) {
        console.warn(
          `[carmen-device] a reply asked for ${start.first.tool}, which this request did not offer`,
        );
        return null;
      }
      chainRef.current?.abort();
      const chain = new AbortController();
      chainRef.current = chain;
      if (stopsRef.current > start.since) {
        chain.abort();
      }
      try {
        return await runBrowserSteps(start.first, {
          panel,
          signal: chain.signal,
          stopRecorded: () => stopRef.current ?? Promise.resolve(false),
          continueRun: (actionId) =>
            start.continueRun(actionId, deviceToolsToSend(panelRef.current)),
          onWaiting: (actionId) => {
            waitingOnRef.current = actionId;
            setWaitingOn(actionId);
          },
          onTimeout: start.onTimeout,
        });
      } finally {
        if (chainRef.current === chain) {
          chainRef.current = null;
        }
      }
    },
    [panel],
  );

  /**
   * The user pressed Stop: a waiting step is dropped, and continued only once `recorded`
   * resolves true, so the server answers with the stop line. A stop that was not recorded
   * continues nothing; the step closes on the server with the next typed message.
   */
  const stop = useCallback((recorded: Promise<boolean>) => {
    stopsRef.current += 1;
    stopRef.current = recorded.catch(() => false);
    chainRef.current?.abort();
  }, []);

  /**
   * The user wrote again while a step waits: the panel drops the step and its card, and the
   * wait goes on until the panel reports it, so the run continues on a closed step.
   */
  const cancelWaitingStep = useCallback(() => {
    if (waitingOnRef.current) {
      panel?.postCancel(waitingOnRef.current);
    }
  }, [panel]);

  // A chat that closes mid-step tells the panel to drop it and continues nothing, even after
  // an earlier Stop.
  useEffect(
    () => () => {
      stopRef.current = null;
      chainRef.current?.abort();
    },
    [],
  );

  return {
    waiting: waitingOn !== null,
    mark,
    run,
    stop,
    cancelWaitingStep,
  };
}
