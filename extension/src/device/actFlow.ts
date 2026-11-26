/**
 * One claimed `browser_click` or `browser_type` (AIO-656), from the card to where the tab
 * is after it. The card shows every time. Before it the panel rules on the tab's address,
 * finds the read's element and refuses fields nothing is typed into (actPrepare.ts); after
 * the tap it checks that the same tab is still active at the same address with sharing on
 * and the rule unchanged, and the acting function checks, in that same document, that the
 * element is still the one the card was drawn for before it acts (actAfterTap.ts). The
 * result is the address, the title and whether the page changed: never page text, never a
 * field's value. Every browser call comes in through `ActDeps`, so this runs without Chrome.
 */
import { actAfterTap } from "./actAfterTap.ts";
import { prepareAct } from "./actPrepare.ts";
import type { ActTool } from "./actStep.ts";
import type { CardWords } from "./cardWords.ts";
import type { ReadOutcome } from "./completion.ts";
import type { PageActRequest } from "./keptSnapshot.ts";
import {
  type GrantAnswer,
  type ReadDeps,
  type ReadProgress,
  stoppedOutcome,
  waitForCard,
} from "./readFlow.ts";
import { StepStopped, untilStopped } from "./stoppableDeps.ts";

/** The browser calls a click or a type needs beyond the read's. */
export type ActDeps = Pick<
  ReadDeps,
  "origins" | "isTabShared" | "activeTab" | "tab" | "hasGrant"
> & {
  /** Shows the click or typing card; resolves with the tap, or `stopped`. */
  askAct: (words: CardWords, signal: AbortSignal) => Promise<GrantAnswer>;
  /** Runs the acting function in the tab's top frame; its document's id and raw answer. */
  inspectTarget: (
    tabId: number,
    request: PageActRequest,
  ) => Promise<{ documentId: string; answer: unknown }>;
  /** Runs the acting function again in that one document only; its raw answer, or null when the document is gone. */
  actOnTarget: (
    tabId: number,
    documentId: string,
    request: PageActRequest,
  ) => Promise<unknown>;
  /** Resolves once a load the step started has finished, or after a short wait when none started. */
  settleTab: (tabId: number, signal: AbortSignal) => Promise<void>;
  /** Whether the tab's document still holds the read's snapshot. */
  holdsSnapshot: (tabId: number, snapshotId: string) => Promise<boolean>;
};

/** Clicks or types for a claimed step, unless a rule, the page or the user says no. */
export async function actOutcome(
  tool: ActTool,
  args: unknown,
  progress: ReadProgress,
  deps: ActDeps,
): Promise<ReadOutcome> {
  try {
    return await actUnlessStopped(
      tool,
      args,
      progress,
      stoppable(deps, progress),
      deps,
    );
  } catch (error) {
    if (error instanceof StepStopped) {
      return stoppedOutcome(progress);
    }
    throw error;
  }
}

/**
 * The step itself. Until it acts, any wait on Chrome or the card throws `StepStopped` once
 * the step is stopped; from the act on it runs on `unstopped` deps and reports what it did.
 */
async function actUnlessStopped(
  tool: ActTool,
  args: unknown,
  progress: ReadProgress,
  deps: ActDeps,
  unstopped: ActDeps,
): Promise<ReadOutcome> {
  const step = await prepareAct(tool, args, deps);
  if ("status" in step) {
    return step;
  }

  progress.observed = step.page.location;
  const answer = await waitForCard(progress, (signal) =>
    deps.askAct(step.words, signal),
  );
  if (answer !== "allowed") {
    return answer === "declined"
      ? { status: "denied", observed: step.page.location }
      : stoppedOutcome(progress);
  }
  return actAfterTap(step, deps, unstopped);
}

/** The deps with every wait before the act raced against the step's stop, as the read's are. */
function stoppable(deps: ActDeps, progress: ReadProgress): ActDeps {
  const until = untilStopped(progress.stopper.signal);

  return {
    ...deps,
    isTabShared: () => until(deps.isTabShared()),
    activeTab: () => until(deps.activeTab()),
    tab: (tabId) => until(deps.tab(tabId)),
    hasGrant: (pattern) => until(deps.hasGrant(pattern)),
    askAct: (words, signal) => until(deps.askAct(words, signal)),
    inspectTarget: (tabId, request) =>
      until(deps.inspectTarget(tabId, request)),
  };
}
