import { assertEquals } from "jsr:@std/assert@1";
import { resumeDueRuns, type WaitStore } from "./drain.ts";
import type { PausedRun, ResumeDeps } from "./resume-run.ts";

/** A claimed wait with no status guard. */
function pausedRun(id: string): PausedRun {
  return {
    id,
    tenant_id: "tenant-1",
    automation_id: "auto-1",
    delay_step_id: "step-1",
    payload: {},
    status_guard: null,
  };
}

/** Deps under which every run resumes; records the order the steps ran in. */
function resumingDeps() {
  const ran: Array<string> = [];
  const deps: ResumeDeps = {
    automationIsActive: () => Promise.resolve(true),
    delayStepExists: () => Promise.resolve(true),
    leadStatus: () => Promise.resolve(null),
    runStepsAfterDelay: (run) => {
      ran.push(run.id);
      return Promise.resolve(null);
    },
  };
  return { ran, deps };
}

/** A store over the due ids; records claims and results. */
function fakeStore(dueIds: Array<string>, overrides: Partial<WaitStore> = {}) {
  const claimed: Array<string> = [];
  const recorded: Array<string> = [];
  const store: WaitStore = {
    dueRunIds: () => Promise.resolve(dueIds),
    claim: (id) => {
      claimed.push(id);
      return Promise.resolve(pausedRun(id));
    },
    record: (run, result) => {
      recorded.push(`${run.id}:${result.status}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { claimed, recorded, store };
}

Deno.test("resumeDueRuns", async (t) => {
  await t.step(
    "claims, resumes and records each due wait in turn",
    async () => {
      const { ran, deps } = resumingDeps();
      const { claimed, recorded, store } = fakeStore(["a", "b"]);

      const counts = await resumeDueRuns(store, deps, () => false);

      assertEquals(claimed, ["a", "b"]);
      assertEquals(ran, ["a", "b"]);
      assertEquals(recorded, ["a:resumed", "b:resumed"]);
      assertEquals(counts, {
        resumed: 2,
        cancelled: 0,
        failed: 0,
        left_waiting: 0,
      });
    },
  );

  await t.step("leaves waits it has no time for unclaimed", async () => {
    const { ran, deps } = resumingDeps();
    const { claimed, store } = fakeStore(["a", "b", "c"]);

    const counts = await resumeDueRuns(store, deps, () => ran.length >= 1);

    assertEquals(claimed, ["a"]);
    assertEquals(counts.left_waiting, 2);
  });

  await t.step(
    "a failed result write does not stop the next wait",
    async () => {
      const { ran, deps } = resumingDeps();
      const { claimed, store } = fakeStore(["a", "b"], {
        record: (run) =>
          run.id === "a"
            ? Promise.reject(new Error("db down"))
            : Promise.resolve(),
      });

      const counts = await resumeDueRuns(store, deps, () => false);

      assertEquals(claimed, ["a", "b"]);
      assertEquals(ran, ["a", "b"]);
      assertEquals(counts.resumed, 2);
    },
  );

  await t.step("skips a wait another worker claimed first", async () => {
    const { ran, deps } = resumingDeps();
    const { recorded, store } = fakeStore(["a", "b"], {
      claim: (id) => Promise.resolve(id === "a" ? null : pausedRun(id)),
    });

    await resumeDueRuns(store, deps, () => false);

    assertEquals(ran, ["b"]);
    assertEquals(recorded, ["b:resumed"]);
  });
});
