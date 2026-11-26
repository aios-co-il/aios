/**
 * One claimed `browser_read_page`, from the tab's real address to its outcome. Every
 * browser call comes in through `ReadDeps`, so the decisions here run without Chrome.
 */
import type { DeviceCardRule } from "../../../supabase/functions/_shared/carmen/device/card-rule.ts";
import type { DeviceToolName } from "../../../supabase/functions/_shared/carmen/device/contract.ts";
import type { EnvironmentOrigins } from "../../../supabase/functions/_shared/carmen/device/never-controllable.ts";
import type { PageLocation } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import type { ReadOutcome } from "./completion.ts";
import { decideReadStep } from "./readStep.ts";
import { readSameSite } from "./sameSiteRead.ts";
import { StepStopped, stoppable } from "./stoppableDeps.ts";
import { pageSnapshot } from "./snapshot.ts";

/**
 * A tab as `chrome.tabs` reports it: `url` is undefined when Chrome does not show it to the
 * extension, and `pendingUrl` is set while a navigation has not committed yet.
 */
export type TabFacts = {
  id: number;
  url: string | undefined;
  pendingUrl: string | undefined;
  title: string;
};

/** What the card ended in: a tap on allow (and Chrome granted), a decline, or a stop. */
export type GrantAnswer = "allowed" | "declined" | "stopped";

export type ReadDeps = {
  origins: EnvironmentOrigins;
  /**
   * Whether the user's "Carmen sees the tab" switch is on. Checked by the panel itself:
   * a site grant also shows Chrome the tab's address, so the switch is not enforced by
   * `url` being undefined.
   */
  isTabShared: () => Promise<boolean>;
  /** The active tab of the panel's window, raw. */
  activeTab: () => Promise<TabFacts | null>;
  /** One tab by id, raw; null when it is gone. */
  tab: (tabId: number) => Promise<TabFacts | null>;
  hasGrant: (pattern: string) => Promise<boolean>;
  /** Shows the panel's card; Chrome's prompt is requested from the tap. */
  askGrant: (
    site: { host: string; pattern: string },
    signal: AbortSignal,
  ) => Promise<GrantAnswer>;
  /** Runs the page collector in the tab and returns its raw answer. */
  readPage: (tabId: number) => Promise<unknown>;
  newSnapshotId: () => string;
};

/** The state of one read that a cancel, the expiry or the panel closing may stop. */
export type ReadProgress = {
  stopper: AbortController;
  /** The rule applied so far, for a report of a step stopped midway. */
  decision: DeviceCardRule | null;
  observed: PageLocation | null;
  /** The card is on screen: the only moment a closing panel reports `cancelled`. */
  asking: boolean;
};

/** Why a step was stopped, as the abort reason carries it. */
export type StopReason = "cancelled" | "expired";

/** Reads the page for a claimed action of `tool`, unless a rule or the user says no. */
export async function readOutcome(
  tool: DeviceToolName,
  progress: ReadProgress,
  deps: ReadDeps,
): Promise<ReadOutcome> {
  if (tool !== "browser_read_page") {
    console.warn(`[carmen-panel] refused ${tool}: this panel only reads`);
    return { status: "refused" };
  }
  try {
    return await readUnlessStopped(progress, stoppable(deps, progress));
  } catch (error) {
    if (error instanceof StepStopped) {
      return stoppedOutcome(progress);
    }
    throw error;
  }
}

/** The read itself; any wait on Chrome or the card throws `StepStopped` once the step is stopped. */
async function readUnlessStopped(
  progress: ReadProgress,
  deps: ReadDeps,
): Promise<ReadOutcome> {
  if (!(await deps.isTabShared())) {
    console.warn("[carmen-panel] refused the read: tab sharing is off");
    return { status: "refused" };
  }
  const tab = await deps.activeTab();
  const step = decideReadStep(tab?.url, deps.origins);
  if (step.kind === "refuse" || !tab) {
    console.warn(
      `[carmen-panel] refused the read: ${step.kind === "refuse" ? step.reason : "no tab"}`,
    );
    return { status: "refused" };
  }

  progress.decision = step.rule;
  progress.observed = step.location;
  const asked = step.rule === "ask" || !(await deps.hasGrant(step.pattern));
  if (asked) {
    const answer = await askOnCard(step, progress, deps);
    if (answer !== "allowed") {
      return answer === "declined"
        ? { status: "denied", observed: step.location }
        : stoppedOutcome(progress);
    }
  }

  const read = await readSameSite(tab.id, step.location.origin, deps);
  if (!read) {
    return {
      status: "target_changed",
      decision: progress.decision,
      observed: progress.observed,
    };
  }
  return {
    status: "done",
    asked,
    snapshot: pageSnapshot({ ...read, snapshotId: deps.newSnapshotId() }),
  };
}

/** The outcome of a step stopped by a cancel or the expiry. */
export function stoppedOutcome(progress: ReadProgress): ReadOutcome {
  const reason: StopReason =
    progress.stopper.signal.reason === "expired" ? "expired" : "cancelled";

  return {
    status: reason,
    decision: progress.decision,
    observed: progress.observed,
  };
}

/** Shows the card and waits for the tap or a stop. */
async function askOnCard(
  step: { host: string; pattern: string },
  progress: ReadProgress,
  deps: ReadDeps,
): Promise<GrantAnswer> {
  progress.decision = "ask";
  progress.asking = true;
  try {
    const answer = await deps.askGrant(
      { host: step.host, pattern: step.pattern },
      progress.stopper.signal,
    );
    return progress.stopper.signal.aborted ? "stopped" : answer;
  } finally {
    progress.asking = false;
  }
}
