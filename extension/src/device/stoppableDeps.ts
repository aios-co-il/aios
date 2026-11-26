/**
 * The read's Chrome and card calls raced against the step's stop (a cancel, the card's life
 * running out or the panel closing), so readFlow.ts never waits past the step's end.
 */
import type { ReadDeps, ReadProgress } from "./readFlow.ts";

/** Thrown by a wait that a cancel, the expiry or the panel closing cut short. */
export class StepStopped extends Error {}

/**
 * The deps with every wait raced against the step's stop, so a Chrome call that never
 * returns (a page whose main thread hangs holds `executeScript`) cannot outlive the
 * step's life. The call itself runs on; its answer is dropped.
 */
export function stoppable(deps: ReadDeps, progress: ReadProgress): ReadDeps {
  const until = untilStopped(progress.stopper.signal);

  return {
    ...deps,
    isTabShared: () => until(deps.isTabShared()),
    activeTab: () => until(deps.activeTab()),
    tab: (tabId) => until(deps.tab(tabId)),
    hasGrant: (pattern) => until(deps.hasGrant(pattern)),
    askGrant: (site, stop) => until(deps.askGrant(site, stop)),
    readPage: (tabId) => until(deps.readPage(tabId)),
  };
}

/** Races any wait against the signal: the wait's answer, or `StepStopped` as soon as the step is stopped. */
export function untilStopped(
  signal: AbortSignal,
): <T>(work: Promise<T>) => Promise<T> {
  return function until<T>(work: Promise<T>): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(new StepStopped());
    }
    return new Promise<T>((resolve, reject) => {
      /** Ends the wait when the step is stopped. */
      function onStop(): void {
        reject(new StepStopped());
      }

      signal.addEventListener("abort", onStop, { once: true });
      work
        .finally(() => signal.removeEventListener("abort", onStop))
        .then(resolve, reject);
    });
  };
}
