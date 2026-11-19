import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { type DelayedRun, pauseRunAtDelay } from "./pause-run.ts";

const run: DelayedRun = {
  tenantId: "tenant-1",
  automationId: "auto-1",
  delayStepId: "step-1",
  entityId: "lead-1",
  triggerType: "lead_status_changed",
  payload: {
    lead_id: "lead-1",
    new_status: "follow_up_week",
    status_kind: "response_status",
    _carmen_history: ["private"],
  },
  config: { delay_require_same_status: true },
  resumeAt: new Date("2026-11-26T04:00:00Z"),
};

type Call = { op: string; values?: unknown; filters: Array<string> };

/**
 * A stand-in for the automation_delayed_runs table: records each statement and
 * answers the cancel with `waitingIds` and the insert with `insertError`.
 */
function fakeDb(waitingIds: Array<string>, insertError: Error | null) {
  const calls: Array<Call> = [];
  function from() {
    const call: Call = { op: "", filters: [] };
    calls.push(call);
    function answer() {
      if (call.op === "insert") {
        return {
          data: insertError ? null : { id: "new-wait" },
          error: insertError,
        };
      }
      return { data: waitingIds.map((id) => ({ id })), error: null };
    }
    const query = {
      update(values: unknown) {
        call.op = "update";
        call.values = values;
        return query;
      },
      insert(values: unknown) {
        call.op = "insert";
        call.values = values;
        return query;
      },
      eq(column: string, value: unknown) {
        call.filters.push(`${column}=${value}`);
        return query;
      },
      in(column: string, values: Array<string>) {
        call.filters.push(`${column} in ${values.join(",")}`);
        return query;
      },
      select: () => query,
      single: () => Promise.resolve(answer()),
      then: (resolve: (value: unknown) => void) => resolve(answer()),
    };
    return query;
  }
  // The fake implements only the calls pauseRunAtDelay makes.
  return { calls, db: { from } as unknown as DbClient };
}

Deno.test("pauseRunAtDelay", async (t) => {
  await t.step(
    "cancels the lead's earlier wait, then stores the new one",
    async () => {
      const { calls, db } = fakeDb(["old-wait"], null);

      assertEquals(await pauseRunAtDelay(db, run), "new-wait");
      assertEquals(
        calls.map((call) => call.op),
        ["update", "insert"],
      );
      assertEquals(calls[0].filters, [
        "tenant_id=tenant-1",
        "automation_id=auto-1",
        "delay_step_id=step-1",
        "entity_id=lead-1",
        "status=waiting",
      ]);
    },
  );

  await t.step(
    "stores the guard and drops run-scoped payload keys",
    async () => {
      const { calls, db } = fakeDb([], null);

      await pauseRunAtDelay(db, run);

      assertEquals(calls[1].values, {
        tenant_id: "tenant-1",
        automation_id: "auto-1",
        delay_step_id: "step-1",
        entity_id: "lead-1",
        trigger_type: "lead_status_changed",
        payload: {
          lead_id: "lead-1",
          new_status: "follow_up_week",
          status_kind: "response_status",
        },
        status_guard: {
          lead_id: "lead-1",
          column: "response_status",
          value: "follow_up_week",
        },
        resume_at: "2026-11-26T04:00:00.000Z",
      });
    },
  );

  await t.step(
    "puts the earlier wait back when the new one is not stored",
    async () => {
      const { calls, db } = fakeDb(["old-wait"], new Error("insert failed"));

      await assertRejects(
        () => pauseRunAtDelay(db, run),
        Error,
        "insert failed",
      );
      assertEquals(
        calls.map((call) => call.op),
        ["update", "insert", "update"],
      );
      assertEquals(calls[2].values, {
        status: "waiting",
        outcome: null,
        finished_at: null,
      });
      assertEquals(calls[2].filters, [
        "tenant_id=tenant-1",
        "id in old-wait",
        "status=cancelled",
      ]);
    },
  );

  await t.step("cancels nothing for a run without an entity", async () => {
    const { calls, db } = fakeDb([], null);

    await pauseRunAtDelay(db, { ...run, entityId: null });

    assertEquals(
      calls.map((call) => call.op),
      ["insert"],
    );
  });
});
