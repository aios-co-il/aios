/**
 * One claimed `browser_screenshot` (AIO-656), from the tab's real address to the picture's
 * path in the user's own private folder. The panel rules on the address and on the fields
 * of every frame it can reach, with the permission the server read for the user; asks on
 * its card, whose tap asks Chrome for the capture grant (shotAsk.ts); checks that the tab
 * is still the same page right before and right after the capture; gives the grant back
 * at once, whatever happened; and uploads the picture only then. The result is the address and the file's path: the server reads the picture,
 * gives it to the model and deletes the file. Every browser call comes in through
 * `ShotDeps`, so this runs without Chrome.
 */
import { RESULT_FIELD_MAX } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { toolResult } from "../../../supabase/functions/_shared/carmen/device-result-check.ts";
import type { CardWords } from "./cardWords.ts";
import type { ReadOutcome } from "./completion.ts";
import {
  type GrantAnswer,
  type ReadDeps,
  type ReadProgress,
  stoppedOutcome,
  type TabFacts,
} from "./readFlow.ts";
import { decideReadStep, type ReadStep } from "./readStep.ts";
import { askOnShotCard } from "./shotAsk.ts";
import { refusedShot, shotArguments } from "./shotStep.ts";
import { StepStopped, untilStopped } from "./stoppableDeps.ts";

/** The browser calls a screenshot needs beyond the read's. */
export type ShotDeps = Pick<
  ReadDeps,
  "origins" | "isTabShared" | "activeTab" | "tab" | "hasGrant"
> & {
  /** Shows the screenshot card; its tap asks Chrome for the capture grant, and a refused prompt is a decline. */
  askShot: (words: CardWords, signal: AbortSignal) => Promise<GrantAnswer>;
  /** Gives the capture grant back; never rejects. */
  dropCaptureGrant: () => Promise<void>;
  /** The field facts of every frame of the tab the site's grant reaches, raw, one entry per frame. */
  pageFields: (tabId: number) => Promise<Array<unknown>>;
  /** The visible part of the panel window's active tab, as a JPEG `data:` address. */
  captureTab: () => Promise<string>;
  /** Stores the picture in the signed-in user's own folder; its storage path. */
  uploadShot: (dataUrl: string) => Promise<string>;
};

export type ReadablePage = Extract<ReadStep, { kind: "read" }>;

/** Pictures the tab for a claimed step, unless a rule, the page or the user says no. */
export async function shotOutcome(
  args: unknown,
  allowed: boolean,
  progress: ReadProgress,
  deps: ShotDeps,
): Promise<ReadOutcome> {
  try {
    return await shotUnlessStopped(
      args,
      allowed,
      progress,
      stoppable(deps, progress),
      deps,
    );
  } catch (error) {
    if (error instanceof StepStopped) {
      return stoppedOutcome(progress);
    }
    throw error;
  } finally {
    // The grant reaches every site: it lasts no longer than the step.
    await deps.dropCaptureGrant();
  }
}

/**
 * The step itself. Until the capture, any wait throws `StepStopped` once the step is
 * stopped; the capture and the upload run on `unstopped` deps, so a picture that was taken
 * is reported, never left behind as `cancelled`.
 */
async function shotUnlessStopped(
  args: unknown,
  allowed: boolean,
  progress: ReadProgress,
  deps: ShotDeps,
  unstopped: ShotDeps,
): Promise<ReadOutcome> {
  if (!shotArguments(args) || !(await deps.isTabShared())) {
    return refusedShot(
      shotArguments(args) ? "sharing_off" : "invalid_arguments",
    );
  }
  const tab = await deps.activeTab();
  const page = decideReadStep(tab?.url, deps.origins);
  if (!tab || page.kind === "refuse") {
    return refusedShot(page.kind === "refuse" ? page.reason : "no tab");
  }
  progress.observed = page.location;

  const asked = await askOnShotCard(tab, page, allowed, progress, deps);
  if (asked !== "allowed") {
    return asked;
  }
  if (!(await stillTheSamePage(tab, deps))) {
    return changed(progress);
  }
  return captureAndStore(tab, page, progress, unstopped);
}

/**
 * Captures, checks that the tab did not move while it was captured, and stores the picture.
 * A tab that moved discards the picture before anything is stored.
 */
async function captureAndStore(
  tab: TabFacts,
  page: ReadablePage,
  progress: ReadProgress,
  deps: ShotDeps,
): Promise<ReadOutcome> {
  const picture = await deps.captureTab();
  await deps.dropCaptureGrant();
  if (!(await stillTheSamePage(tab, deps))) {
    return changed(progress);
  }
  const storagePath = await deps.uploadShot(picture);
  const result = {
    ...page.location,
    storage_path: storagePath,
  };
  const owner = storagePath.split("/")[0] ?? "";
  if (
    storagePath.length > RESULT_FIELD_MAX ||
    !toolResult("browser_screenshot", result, owner)
  ) {
    throw new Error("The stored picture's path does not fit the contract");
  }
  return { status: "done", asked: true, result };
}

/** The same tab is still the active one at the same address, with no load pending and sharing on. */
async function stillTheSamePage(
  tab: TabFacts,
  deps: ShotDeps,
): Promise<boolean> {
  const now = await deps.activeTab();
  const shared = await deps.isTabShared();

  return shared && now?.id === tab.id && now.url === tab.url && !now.pendingUrl;
}

/** The page changed under the step: nothing is pictured or stored. */
function changed(progress: ReadProgress): ReadOutcome {
  return {
    status: "target_changed",
    decision: progress.decision,
    observed: progress.observed,
  };
}

/** The deps with every wait before the capture raced against the step's stop. */
function stoppable(deps: ShotDeps, progress: ReadProgress): ShotDeps {
  const until = untilStopped(progress.stopper.signal);

  return {
    ...deps,
    isTabShared: () => until(deps.isTabShared()),
    activeTab: () => until(deps.activeTab()),
    tab: (tabId) => until(deps.tab(tabId)),
    hasGrant: (pattern) => until(deps.hasGrant(pattern)),
    askShot: (words, signal) => until(deps.askShot(words, signal)),
    pageFields: (tabId) => until(deps.pageFields(tabId)),
  };
}
