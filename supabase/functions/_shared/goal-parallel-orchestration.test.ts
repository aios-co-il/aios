import {
  settleParallelSteps,
  isParallelCursorStep,
  selectParallelDispatchBatch,
  selectInProgressCursorTracks,
  type ParallelPlanStep,
} from "./goal-parallel-orchestration.ts";

function step(
  partial: Partial<ParallelPlanStep> & { id: string },
): ParallelPlanStep {
  return {
    title: "t",
    status: "pending",
    action_type: "cursor",
    priority: 5,
    sort_order: 0,
    metadata: {},
    ...partial,
  };
}

Deno.test(
  "selectParallelDispatchBatch requires 2+ parallel cursor steps",
  () => {
    const batch = selectParallelDispatchBatch([
      step({ id: "1", parallel_track: true, sub_project_key: "creative" }),
      step({ id: "2", parallel_track: true, sub_project_key: "copy" }),
    ]);
    if (batch.length !== 2) throw new Error("expected 2");
    const single = selectParallelDispatchBatch([
      step({ id: "1", parallel_track: true, sub_project_key: "x" }),
    ]);
    if (single.length !== 0) throw new Error("expected 0 for single");
  },
);

Deno.test("isParallelCursorStep detects sub_project_key", () => {
  if (!isParallelCursorStep(step({ id: "1", sub_project_key: "seo" }))) {
    throw new Error("expected parallel");
  }
});

Deno.test("selectInProgressCursorTracks finds monitoring rows", () => {
  const rows = selectInProgressCursorTracks([
    step({
      id: "1",
      status: "in_progress",
      cursor_agent_id: "bc-abc",
      sub_project_key: "copy",
    }),
  ]);
  if (rows.length !== 1) throw new Error("expected 1");
});

Deno.test(
  "a failed parallel dispatch waits for its sibling before rejecting",
  async () => {
    /** Fail clearly if the promise gate was not installed. */
    function missingGate(): void {
      throw new Error("missing gate");
    }
    let release: () => void = missingGate;
    const sibling = new Promise<string>((resolve) => {
      release = () => resolve("done");
    });
    const failure = new Error("failed dispatch");
    let finished = false;
    const result = settleParallelSteps([Promise.reject(failure), sibling]).then(
      () => {
        throw new Error("expected rejection");
      },
      (error) => {
        finished = true;
        if (error !== failure) {
          throw error;
        }
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    if (finished) {
      throw new Error("released lock while sibling pending");
    }
    release();
    await result;
    if (!finished) {
      throw new Error("missing failure");
    }
  },
);
