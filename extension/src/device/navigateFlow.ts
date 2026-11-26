/**
 * One claimed `browser_navigate`, from the card to where the tab landed. The card shows
 * every time; the tab is ruled on before the card and again after the tap, only the active
 * tab of the panel's window is moved, and the page it lands on is ruled on before anything
 * of it is reported. The result is the landed address and Chrome's title, never page text:
 * the run reads the new page with its own step. Every browser call comes in through
 * `NavigateDeps`, so the decisions run without Chrome.
 */
import { RESULT_FIELD_MAX } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { toolResult } from "../../../supabase/functions/_shared/carmen/device-result-check.ts";
import type { ReadOutcome, StepResult } from "./completion.ts";
import { decideNavigateStep, landedPage } from "./navigateStep.ts";
import {
  type GrantAnswer,
  type ReadDeps,
  type ReadProgress,
  stoppedOutcome,
  type TabFacts,
  waitForCard,
} from "./readFlow.ts";
import { oneLineUpTo } from "./snapshot.ts";
import { StepStopped, untilStopped } from "./stoppableDeps.ts";

/** The browser calls a navigation needs beyond the read's. */
export type NavigateDeps = Pick<
  ReadDeps,
  "origins" | "isTabShared" | "activeTab" | "tab"
> & {
  /** Shows the navigation card; resolves with the tap, or `stopped`. */
  askNavigate: (
    card: { fromHost: string; host: string; href: string },
    signal: AbortSignal,
  ) => Promise<GrantAnswer>;
  /** Sends the tab to the address and resolves once it has finished loading; the signal stops the wait. */
  navigateTab: (
    tabId: number,
    url: string,
    signal: AbortSignal,
  ) => Promise<void>;
};

/** Moves the tab for a claimed navigation, unless a rule or the user says no. */
export async function navigateOutcome(
  args: unknown,
  progress: ReadProgress,
  deps: NavigateDeps,
): Promise<ReadOutcome> {
  try {
    return await navigateUnlessStopped(
      args,
      progress,
      stoppable(deps, progress),
    );
  } catch (error) {
    if (error instanceof StepStopped) {
      return stoppedOutcome(progress);
    }
    throw error;
  }
}

/** The navigation itself; any wait on Chrome or the card throws `StepStopped` once the step is stopped. */
async function navigateUnlessStopped(
  args: unknown,
  progress: ReadProgress,
  deps: NavigateDeps,
): Promise<ReadOutcome> {
  if (!(await deps.isTabShared())) {
    console.warn("[carmen-panel] refused the navigation: tab sharing is off");
    return { status: "refused" };
  }
  const tab = await deps.activeTab();
  const step = decideNavigateStep(tab?.url, args, deps.origins);
  if (step.kind === "refuse" || !tab) {
    console.warn(
      `[carmen-panel] refused the navigation: ${step.kind === "refuse" ? step.reason : "no tab"}`,
    );
    return { status: "refused" };
  }

  progress.observed = step.from;
  const answer = await waitForCard(progress, (signal) =>
    deps.askNavigate(
      { fromHost: step.fromHost, host: step.host, href: step.destination },
      signal,
    ),
  );
  if (answer !== "allowed") {
    return answer === "declined"
      ? { status: "denied", observed: step.from }
      : stoppedOutcome(progress);
  }
  if (!(await stillTheSameTab(tab, args, deps))) {
    return {
      status: "target_changed",
      decision: "ask",
      observed: step.from,
    };
  }

  await deps.navigateTab(tab.id, step.destination, progress.stopper.signal);
  return landedOutcome(tab.id, deps);
}

/**
 * After the tap: the tab is still the active one, at the address the card was drawn for,
 * with no navigation of its own pending, sharing is still on, and the contract still
 * allows the move from there.
 */
async function stillTheSameTab(
  before: TabFacts,
  args: unknown,
  deps: NavigateDeps,
): Promise<boolean> {
  const now = await deps.activeTab();
  const shared = await deps.isTabShared();

  return (
    shared &&
    now?.id === before.id &&
    now.url === before.url &&
    !now.pendingUrl &&
    decideNavigateStep(now.url, args, deps.origins).kind === "navigate"
  );
}

/** Where the tab landed, or a refusal that reports nothing of the page. */
async function landedOutcome(
  tabId: number,
  deps: NavigateDeps,
): Promise<ReadOutcome> {
  const landed = await deps.tab(tabId);
  const location = landedPage(landed?.url, deps.origins);
  if (!landed || typeof location === "string") {
    console.warn(
      `[carmen-panel] the navigation landed out of reach: ${typeof location === "string" ? location : "tab gone"}`,
    );
    return { status: "refused" };
  }

  const result: StepResult = {
    ...location,
    title: oneLineUpTo(pageTitle(landed), RESULT_FIELD_MAX),
  };
  if (!toolResult("browser_navigate", result, "")) {
    throw new Error("The navigation result does not fit the contract's result");
  }
  return { status: "done", asked: true, result };
}

/**
 * The page's own title, or "" when Chrome shows the address in its place (a page without
 * a title): that address holds the query and fragment, which the result leaves out because
 * they may carry tokens.
 */
export function pageTitle(tab: TabFacts): string {
  const address = tab.url ?? "";
  const shown = address.replace(/^https?:\/\//, "");

  return tab.title === address || tab.title === shown ? "" : tab.title;
}

/** The deps with every wait raced against the step's stop, as the read's are. */
function stoppable(deps: NavigateDeps, progress: ReadProgress): NavigateDeps {
  const until = untilStopped(progress.stopper.signal);

  return {
    ...deps,
    isTabShared: () => until(deps.isTabShared()),
    activeTab: () => until(deps.activeTab()),
    tab: (tabId) => until(deps.tab(tabId)),
    askNavigate: (card, signal) => until(deps.askNavigate(card, signal)),
    navigateTab: (tabId, url, signal) =>
      until(deps.navigateTab(tabId, url, signal)),
  };
}
