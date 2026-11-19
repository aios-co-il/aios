import { assertEquals } from "jsr:@std/assert@1";
import {
  type PausedRun,
  type ResumeDeps,
  resumePausedRun,
} from "./resume-run.ts";

const run: PausedRun = {
  id: "run-1",
  tenant_id: "tenant-1",
  automation_id: "auto-1",
  delay_step_id: "step-1",
  payload: { lead_id: "lead-1" },
  status_guard: {
    lead_id: "lead-1",
    column: "response_status",
    value: "follow_up_week",
  },
};

/** Deps for a run that should resume, recording whether the steps ran. */
function deps(overrides: Partial<ResumeDeps> = {}) {
  const calls = { ran: 0 };
  const base: ResumeDeps = {
    automationIsActive: () => Promise.resolve(true),
    delayStepExists: () => Promise.resolve(true),
    leadStatus: () =>
      Promise.resolve({ status: "new", response_status: "follow_up_week" }),
    runStepsAfterDelay: () => {
      calls.ran++;
      return Promise.resolve(null);
    },
  };
  return { calls, deps: { ...base, ...overrides } };
}

Deno.test("resumePausedRun", async (t) => {
  await t.step("runs the steps when the lead kept its status", async () => {
    const d = deps();
    assertEquals(await resumePausedRun(run, d.deps), {
      status: "resumed",
      outcome: null,
    });
    assertEquals(d.calls.ran, 1);
  });

  await t.step("cancels when the lead moved to another status", async () => {
    const d = deps({
      leadStatus: () =>
        Promise.resolve({ status: "new", response_status: "not_relevant" }),
    });
    assertEquals(await resumePausedRun(run, d.deps), {
      status: "cancelled",
      outcome: "lead_status_changed",
    });
    assertEquals(d.calls.ran, 0);
  });

  await t.step("cancels when the lead was deleted", async () => {
    const d = deps({ leadStatus: () => Promise.resolve(null) });
    assertEquals(
      (await resumePausedRun(run, d.deps)).outcome,
      "lead_status_changed",
    );
    assertEquals(d.calls.ran, 0);
  });

  await t.step("reads the lead inside the run's org", async () => {
    const seen: Array<string> = [];
    const d = deps({
      leadStatus: (tenantId, leadId) => {
        seen.push(`${tenantId}/${leadId}`);
        return Promise.resolve(null);
      },
    });
    await resumePausedRun(run, d.deps);
    assertEquals(seen, ["tenant-1/lead-1"]);
  });

  await t.step(
    "resumes without a lead check when no guard is stored",
    async () => {
      const d = deps({
        leadStatus: () => Promise.reject(new Error("must not be read")),
      });
      assertEquals(
        (await resumePausedRun({ ...run, status_guard: null }, d.deps)).status,
        "resumed",
      );
    },
  );

  await t.step("cancels when a stored guard cannot be read", async () => {
    const d = deps();
    assertEquals(
      await resumePausedRun({ ...run, status_guard: { lead_id: 7 } }, d.deps),
      { status: "cancelled", outcome: "status_guard_unreadable" },
    );
    assertEquals(d.calls.ran, 0);
  });

  await t.step("cancels when the automation is off or deleted", async () => {
    const d = deps({ automationIsActive: () => Promise.resolve(false) });
    assertEquals(
      (await resumePausedRun(run, d.deps)).outcome,
      "automation_inactive",
    );
    assertEquals(d.calls.ran, 0);
  });

  await t.step("cancels when the delay step was removed", async () => {
    const d = deps({ delayStepExists: () => Promise.resolve(false) });
    assertEquals(
      (await resumePausedRun(run, d.deps)).outcome,
      "delay_step_removed",
    );
    assertEquals(d.calls.ran, 0);
  });

  await t.step("records a skip reason from trigger-automation", async () => {
    const d = deps({
      runStepsAfterDelay: () => Promise.resolve("trigger_config_mismatch"),
    });
    assertEquals(await resumePausedRun(run, d.deps), {
      status: "cancelled",
      outcome: "trigger_config_mismatch",
    });
  });

  await t.step("records a failed step as failed, with its error", async () => {
    const d = deps({
      runStepsAfterDelay: () => Promise.reject(new Error("send failed")),
    });
    assertEquals(await resumePausedRun(run, d.deps), {
      status: "failed",
      outcome: "send failed",
    });
  });

  await t.step("records a failed lookup as failed", async () => {
    const d = deps({
      automationIsActive: () => Promise.reject(new Error("db down")),
    });
    assertEquals(await resumePausedRun(run, d.deps), {
      status: "failed",
      outcome: "db down",
    });
  });
});
