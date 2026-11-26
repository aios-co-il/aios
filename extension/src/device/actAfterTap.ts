/**
 * The part of a click or a type after the tap (AIO-656): the panel checks the tab again,
 * the acting function checks the element again in the card's own document and acts, and the
 * panel reports where the tab is and whether the page changed, never page text.
 */
import { RESULT_FIELD_MAX } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { toolResult } from "../../../supabase/functions/_shared/carmen/device-result-check.ts";
import { actAnswer } from "./actAnswer.ts";
import type { ActDeps } from "./actFlow.ts";
import type { PreparedAct } from "./actPrepare.ts";
import { actRule } from "./actStep.ts";
import type { ReadOutcome, StepResult } from "./completion.ts";
import { pageTitle } from "./navigateFlow.ts";
import { landedPage } from "./navigateStep.ts";
import { oneLineUpTo } from "./snapshot.ts";

/**
 * Acts when the tab and the element are still what the card showed. `deps` are raced
 * against a stop up to the act; `unstopped` are not, since a step that may have acted
 * must report so, never `cancelled`.
 */
export async function actAfterTap(
  step: PreparedAct,
  deps: ActDeps,
  unstopped: ActDeps,
): Promise<ReadOutcome> {
  const changed = {
    status: "target_changed",
    decision: "ask",
    observed: step.page.location,
  } as const;
  if (!(await stillTheSamePage(step, deps))) {
    return changed;
  }
  const acted = actAnswer(
    await unstopped.actOnTarget(step.tab.id, step.documentId, {
      ...step.request,
      expected: step.target.fingerprint,
      text: step.claimed.text ?? undefined,
    }),
  );
  if (acted?.kind !== "acted") {
    console.warn(
      `[carmen-panel] ${step.tool} after the tap: ${acted?.kind === "changed" ? acted.reason : "document gone"}`,
    );
    return changed;
  }

  await unstopped.settleTab(step.tab.id, new AbortController().signal);
  return afterTheStep(step, unstopped);
}

/**
 * The tab is still the active one, at the address the card was drawn for, with no
 * navigation pending, sharing is still on, and the contract still asks there.
 */
async function stillTheSamePage(
  step: PreparedAct,
  deps: ActDeps,
): Promise<boolean> {
  const now = await deps.activeTab();
  const shared = await deps.isTabShared();

  return (
    shared &&
    now?.id === step.tab.id &&
    now.url === step.tab.url &&
    !now.pendingUrl &&
    actRule(step.tool, now.url ?? "", step.sensitive, deps.origins) === "ask"
  );
}

/** Where the tab is after the step, or a refusal that reports nothing of a page out of reach. */
async function afterTheStep(
  step: PreparedAct,
  deps: ActDeps,
): Promise<ReadOutcome> {
  const after = await deps.tab(step.tab.id);
  const location = landedPage(after?.url, deps.origins);
  if (!after || typeof location === "string") {
    console.warn(
      `[carmen-panel] ${step.tool} landed out of reach: ${typeof location === "string" ? location : "tab gone"}`,
    );
    return { status: "refused" };
  }
  const samePage =
    step.page.location.origin === location.origin &&
    step.page.location.path === location.path;
  const changed =
    !samePage ||
    !(await deps.holdsSnapshot(step.tab.id, step.claimed.snapshotId));

  const result: StepResult = {
    ...location,
    title: oneLineUpTo(pageTitle(after), RESULT_FIELD_MAX),
    changed,
  };
  if (!toolResult(step.tool, result, "")) {
    throw new Error(
      `The ${step.tool} result does not fit the contract's result`,
    );
  }
  return { status: "done", asked: true, result };
}
