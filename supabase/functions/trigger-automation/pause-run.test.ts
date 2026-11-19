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
 * A stand-in for the automation_delayed_runs table: records each statement,
 * answers each restart (update) with the next of `openWaitIds` and the insert
 * with `insertError`.
 */
function fakeDb(
  openWaitIds: Array<string | null>,
  insertError: { code: string; message: string } | null,
) {
  const calls: Array<Call> = [];
  const restarts = [...openWaitIds];
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
      const id = restarts.shift() ?? null;
      return { data: id ? { id } : null, error: null };
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
      select: () => query,
      single: () => Promise.resolve(answer()),
      maybeSingle: () => Promise.resolve(answer()),
    };
    return query;
  }
  // The fake implements only the calls pauseRunAtDelay makes.
  return { calls, db: { from } as unknown as DbClient };
}

const WAIT_VALUES = {
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
};

Deno.test("pauseRunAtDelay", async (t) => {
  await t.step("restarts the lead's open wait in one statement", async () => {
    const { calls, db } = fakeDb(["open-wait"], null);

    assertEquals(await pauseRunAtDelay(db, run), "open-wait");
    assertEquals(
      calls.map((call) => call.op),
      ["update"],
    );
    assertEquals(calls[0].values, WAIT_VALUES);
    assertEquals(calls[0].filters, [
      "tenant_id=tenant-1",
      "automation_id=auto-1",
      "delay_step_id=step-1",
      "entity_id=lead-1",
      "status=waiting",
    ]);
  });

  await t.step(
    "stores a new wait, without run-scoped payload keys",
    async () => {
      const { calls, db } = fakeDb([null], null);

      assertEquals(await pauseRunAtDelay(db, run), "new-wait");
      assertEquals(calls[1].values, {
        tenant_id: "tenant-1",
        automation_id: "auto-1",
        delay_step_id: "step-1",
        entity_id: "lead-1",
        ...WAIT_VALUES,
      });
    },
  );

  await t.step("restarts the wait a racing run stored first", async () => {
    const { calls, db } = fakeDb([null, "raced-wait"], {
      code: "23505",
      message: "duplicate key",
    });

    assertEquals(await pauseRunAtDelay(db, run), "raced-wait");
    assertEquals(
      calls.map((call) => call.op),
      ["update", "insert", "update"],
    );
  });

  await t.step("fails when the wait cannot be stored", async () => {
    const { calls, db } = fakeDb([null], { code: "XX000", message: "db down" });

    await assertRejects(() => pauseRunAtDelay(db, run));
    assertEquals(
      calls.map((call) => call.op),
      ["update", "insert"],
    );
  });

  await t.step("only inserts for a run without an entity", async () => {
    const { calls, db } = fakeDb([], null);

    await pauseRunAtDelay(db, { ...run, entityId: null });

    assertEquals(
      calls.map((call) => call.op),
      ["insert"],
    );
  });
});
