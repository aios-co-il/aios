import assert from "node:assert/strict";
import test from "node:test";
import {
  describeCronHe,
  isValidCron,
  nextCronRun,
  parseCron,
} from "./cron-next.ts";
import {
  STALE_RUN_WINDOW_MS,
  computeNextRun,
  decideRecurringRun,
  freshOccurrenceResult,
} from "./agent-task-schedule.ts";

const TZ = "Asia/Jerusalem";

test("parseCron rejects malformed expressions", () => {
  assert.equal(parseCron("* * * *"), null);
  assert.equal(parseCron("60 * * * *"), null);
  assert.equal(parseCron("*/0 * * * *"), null);
  assert.equal(parseCron("5-1 * * * *"), null);
  assert.equal(isValidCron("0 9 * * 1-5"), true);
  assert.equal(isValidCron("bogus"), false);
});

test("daily 09:00 Israel time (winter, UTC+2)", () => {
  // 2026-12-01 05:00Z = 07:00 Israel
  const next = nextCronRun("0 9 * * *", new Date("2026-12-01T05:00:00Z"), TZ);
  assert.equal(next?.toISOString(), "2026-12-01T07:00:00.000Z");
});

test("daily 09:00 Israel time (summer, UTC+3)", () => {
  const next = nextCronRun("0 9 * * *", new Date("2026-07-01T05:00:00Z"), TZ);
  assert.equal(next?.toISOString(), "2026-07-01T06:00:00.000Z");
});

test("strictly after: at exactly the slot, the next day is returned", () => {
  const from = new Date("2026-12-01T07:00:00Z"); // 09:00 Israel
  const next = nextCronRun("0 9 * * *", from, TZ);
  assert.equal(next?.toISOString(), "2026-12-02T07:00:00.000Z");
});

test("every 15 minutes", () => {
  const next = nextCronRun(
    "*/15 * * * *",
    new Date("2026-12-01T05:07:30Z"),
    TZ,
  );
  assert.equal(next?.toISOString(), "2026-12-01T05:15:00.000Z");
});

test("Sunday is 0 and 7", () => {
  // 2026-12-03 is a Thursday. Next Sunday is 2026-12-06.
  const from = new Date("2026-12-03T10:00:00Z");
  assert.equal(
    nextCronRun("0 8 * * 0", from, TZ)?.toISOString(),
    "2026-12-06T06:00:00.000Z",
  );
  assert.equal(
    nextCronRun("0 8 * * 7", from, TZ)?.toISOString(),
    "2026-12-06T06:00:00.000Z",
  );
});

test("weekdays only skips Friday/Saturday", () => {
  // Friday 2026-12-04 10:00 Israel -> next is Sunday 2026-12-06 09:00
  const from = new Date("2026-12-04T08:00:00Z");
  assert.equal(
    nextCronRun("0 9 * * 0-4", from, TZ)?.toISOString(),
    "2026-12-06T07:00:00.000Z",
  );
});

test("dom and dow both restricted match either", () => {
  // 1st of month OR Monday. From Thu 2026-12-03 -> Mon 2026-12-07
  const from = new Date("2026-12-03T10:00:00Z");
  assert.equal(
    nextCronRun("0 9 1 * 1", from, TZ)?.toISOString(),
    "2026-12-07T07:00:00.000Z",
  );
});

test("DST gap: a non-existent local time is skipped", () => {
  // Israel springs forward on Friday 2027-03-26 02:00 -> 03:00.
  const from = new Date("2027-03-25T12:00:00Z");
  const next = nextCronRun("30 2 * * *", from, TZ);
  // 02:30 does not exist on 03-26, so the next run is 03-27 02:30 (UTC+3).
  assert.equal(next?.toISOString(), "2027-03-26T23:30:00.000Z");
});

test("describeCronHe covers common presets", () => {
  assert.equal(describeCronHe("0 9 * * *"), "כל יום ב-09:00");
  assert.equal(describeCronHe("*/15 * * * *"), "כל 15 דקות");
  assert.equal(describeCronHe("0 * * * *"), "כל שעה");
  assert.equal(describeCronHe("0 8 * * 0"), "כל ראשון ב-08:00");
  assert.equal(describeCronHe("0 9 * * 0-4"), "בימי חול (א׳–ה׳) ב-09:00");
  assert.equal(describeCronHe("0 5,14 * * *"), "כל יום ב-05:00, 14:00");
});

test("decideRecurringRun: due now runs and schedules the next slot", () => {
  const now = new Date("2026-12-01T07:00:30Z");
  const d = decideRecurringRun(
    {
      cron_expression: "0 9 * * *",
      timezone: TZ,
      next_run: "2026-12-01T07:00:00Z",
    },
    now,
  );
  assert.equal(d.action, "run");
  assert.equal(d.nextRun, "2026-12-02T07:00:00.000Z");
});

test("decideRecurringRun: a stale slot is skipped, never replayed", () => {
  const now = new Date("2026-12-03T07:00:30Z");
  const d = decideRecurringRun(
    {
      cron_expression: "0 9 * * *",
      timezone: TZ,
      next_run: new Date(
        now.getTime() - STALE_RUN_WINDOW_MS - 1000,
      ).toISOString(),
    },
    now,
  );
  assert.equal(d.action, "skip_stale");
  assert.equal(d.nextRun, "2026-12-04T07:00:00.000Z");
});

test("decideRecurringRun: invalid cron", () => {
  const d = decideRecurringRun(
    { cron_expression: "nope", next_run: "2026-12-01T07:00:00Z" },
    new Date("2026-12-01T07:00:30Z"),
  );
  assert.deepEqual(d, { action: "invalid", nextRun: null });
});

test("computeNextRun defaults to Israel time", () => {
  assert.equal(
    computeNextRun("0 9 * * *", new Date("2026-12-01T05:00:00Z"), null),
    "2026-12-01T07:00:00.000Z",
  );
  assert.equal(computeNextRun(null, new Date()), null);
});

test("freshOccurrenceResult drops the previous conversation", () => {
  const fresh = freshOccurrenceResult({
    conversation_history: [{ role: "user", content: "x" }],
    total_tool_calls: 12,
    notify: { surface: "whatsapp", chat_id: "1@c.us" },
    last_output: "ok",
    tool_log: ["a"],
  });
  assert.deepEqual(fresh, {
    notify: { surface: "whatsapp", chat_id: "1@c.us" },
    last_output: "ok",
    conversation_history: [],
    total_tool_calls: 0,
  });
});
