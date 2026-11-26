/**
 * Resuming a run that paused at a device step (AIO-686). The continuation request names
 * the step; everything else comes from the row: whose it is, whether it is closed, and its
 * result. The run's stop is read first and an unreadable stop refuses (unlike a turn in
 * progress), and a step is used once: its page text is cleared in the same write.
 *
 * A result completed on a step whose claim failed on an unreadable stop is trusted no more
 * than any panel report: a stop is never removed (`carmen_run_cancellations` holds no
 * UPDATE or DELETE grant), so the stop read here sees every stop the claim could have
 * missed, and a stopped run resumes nothing.
 */
import { holdsAnotherOrigin } from "../../_shared/carmen/device/card-rule.ts";
import type { EnvironmentOrigins } from "../../_shared/carmen/device/never-controllable.ts";
import { readRunStopped } from "../../_shared/carmen/run-stop.ts";
import { stepResidue } from "./step-residue.ts";
import { isClosedStatus, type StepOutcome } from "./data-block.ts";
import {
  consumeStep,
  type DeviceDb,
  readRunSteps,
  readStep,
  type RunKey,
  type RunStep,
  type StepRow,
} from "./rows.ts";
import { settleStep } from "./settle.ts";
import { storedResult } from "./stored-result.ts";
import {
  resumedScreenshot,
  screenshotFile,
  type TakenScreenshot,
} from "./screenshot.ts";

/** The step a continuation names, in its run and conversation. */
export type ContinuedStep = RunKey & {
  conversationId: string;
  actionId: string;
};

/** What a continuation request may do. */
export type Continuation =
  /** Nothing to resume: answered without the model, with one generic error. */
  | { kind: "refused"; reason: string }
  /**
   * The user stopped the run: answered with the stop line, without the model. `screenshot`:
   * the file of a picture nobody will see, to delete.
   */
  | { kind: "stopped"; screenshot: string | null }
  /**
   * `steps`: the run's steps after this one was used, in the order they were written.
   * `screenshot`: a done picture's file, to read when its result passed and delete always.
   */
  | {
      kind: "resume";
      outcome: StepOutcome;
      steps: Array<RunStep>;
      screenshot: TakenScreenshot | null;
    };

/** What only the server knows about the user when a step is resumed. */
export type ResumeFacts = {
  /** The user's permission to picture a sensitive page, read now (`sensitive-screenshots.ts`). */
  sensitiveScreenshotsAllowed: () => Promise<boolean>;
};

/** Reads, closes and uses the named step; what the request may do next. */
export async function resumeFromStep(
  db: DeviceDb,
  named: ContinuedStep,
  origins: EnvironmentOrigins,
  now: Date,
  facts: ResumeFacts,
): Promise<Continuation> {
  let stopped: boolean;
  try {
    stopped = await readRunStopped(db, named.runId, named.userId);
  } catch (error) {
    console.error(`[device] run=${named.runId} stop unreadable`, error);
    return { kind: "refused", reason: "stop_unreadable" };
  }
  const step = await readStep(db, named);
  if (!step || step.consumed_at) {
    return { kind: "refused", reason: "not_available" };
  }
  if (stopped) {
    // Named before the step is closed, which clears its result.
    const screenshot = screenshotFile(step, named.userId);
    await closeForStop(db, named, step, now);
    return { kind: "stopped", screenshot };
  }

  const closed = await closedStep(db, named, step, now);
  if (!closed) {
    return { kind: "refused", reason: "not_closed" };
  }
  const pictured =
    closed.tool === "browser_screenshot" && closed.status === "done";
  const allowed = pictured && (await facts.sensitiveScreenshotsAllowed());
  const checked =
    closed.status === "done"
      ? storedResult(closed, named.userId, origins, allowed)
      : null;
  const file = screenshotFile(closed, named.userId);
  // A read keeps its snapshot id and refs, a click or type whether it changed the page.
  const keep = checked?.result
    ? stepResidue(closed.tool, checked.result)
    : null;
  if (
    !(await consumeStep(
      db,
      named,
      closed,
      Boolean(checked?.refusal),
      now,
      keep,
    ))
  ) {
    return { kind: "refused", reason: "already_used" };
  }
  const steps = await readRunSteps(db, named);

  return {
    kind: "resume",
    outcome: {
      tool: closed.tool,
      status: checked?.refusal ? "refused" : closed.status,
      result: checked?.result ?? null,
      tainted: runTainted(named, steps),
    },
    steps,
    screenshot: resumedScreenshot(file, checked?.result ?? null, named.userId),
  };
}

/** The step once nobody can change it any more, or null while it is still open. */
async function closedStep(
  db: DeviceDb,
  named: ContinuedStep,
  step: StepRow,
  now: Date,
): Promise<(StepRow & { status: StepOutcome["status"] }) | null> {
  const settled = await settleStep(db, named, step, "keep", now);
  // The panel completed it between the read and the write: read what it wrote.
  const current = settled.raced
    ? await readStep(db, named)
    : { ...step, status: settled.status };
  if (!current || current.consumed_at || !isClosedStatus(current.status)) {
    return null;
  }
  return { ...current, status: current.status };
}

/** A stopped run: the step is closed and, when closed already, its page text cleared. */
async function closeForStop(
  db: DeviceDb,
  named: ContinuedStep,
  step: StepRow,
  now: Date,
): Promise<void> {
  const settled = await settleStep(db, named, step, "cancelled", now);
  if (!settled.raced && isClosedStatus(settled.status)) {
    await consumeStep(
      db,
      named,
      { id: step.id, status: settled.status },
      false,
      now,
    );
  }
}

/**
 * Whether the run holds page text from more than one origin: recorded in the log and the
 * block. A further step's card rule measures taint against its own tab instead (step.ts).
 */
function runTainted(
  named: ContinuedStep,
  steps: Array<{ observed_origin: string | null }>,
): boolean {
  const origins = steps.flatMap((step) =>
    step.observed_origin ? [step.observed_origin] : [],
  );
  const tainted = origins.length > 0 && holdsAnotherOrigin(origins[0], origins);
  if (tainted) {
    console.warn(
      `[device] run=${named.runId} tainted: pages from ${new Set(origins).size} origins`,
    );
  }
  return tainted;
}
