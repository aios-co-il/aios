import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
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

Deno.test("parseCron rejects malformed expressions", () => {
  assertStrictEquals(parseCron("* * * *"), null);
  assertStrictEquals(parseCron("60 * * * *"), null);
  assertStrictEquals(parseCron("*/0 * * * *"), null);
  assertStrictEquals(parseCron("5-1 * * * *"), null);
  assertStrictEquals(isValidCron("0 9 * * 1-5"), true);
  assertStrictEquals(isValidCron("bogus"), false);
});

Deno.test("daily 09:00 Israel time (winter, UTC+2)", () => {
  // 2026-12-01 05:00Z = 07:00 Israel
  const next = nextCronRun("0 9 * * *", new Date("2026-12-01T05:00:00Z"), TZ);
  assertStrictEquals(next?.toISOString(), "2026-12-01T07:00:00.000Z");
});

Deno.test("daily 09:00 Israel time (summer, UTC+3)", () => {
  const next = nextCronRun("0 9 * * *", new Date("2026-07-01T05:00:00Z"), TZ);
  assertStrictEquals(next?.toISOString(), "2026-07-01T06:00:00.000Z");
});

Deno.test(
  "strictly after: at exactly the slot, the next day is returned",
  () => {
    const from = new Date("2026-12-01T07:00:00Z"); // 09:00 Israel
    const next = nextCronRun("0 9 * * *", from, TZ);
    assertStrictEquals(next?.toISOString(), "2026-12-02T07:00:00.000Z");
  },
);

Deno.test("every 15 minutes", () => {
  const next = nextCronRun(
    "*/15 * * * *",
    new Date("2026-12-01T05:07:30Z"),
    TZ,
  );
  assertStrictEquals(next?.toISOString(), "2026-12-01T05:15:00.000Z");
});

Deno.test("Sunday is 0 and 7", () => {
  // 2026-12-03 is a Thursday. Next Sunday is 2026-12-06.
  const from = new Date("2026-12-03T10:00:00Z");
  assertStrictEquals(
    nextCronRun("0 8 * * 0", from, TZ)?.toISOString(),
    "2026-12-06T06:00:00.000Z",
  );
  assertStrictEquals(
    nextCronRun("0 8 * * 7", from, TZ)?.toISOString(),
    "2026-12-06T06:00:00.000Z",
  );
});

Deno.test("weekdays only skips Friday/Saturday", () => {
  // Friday 2026-12-04 10:00 Israel -> next is Sunday 2026-12-06 09:00
  const from = new Date("2026-12-04T08:00:00Z");
  assertStrictEquals(
    nextCronRun("0 9 * * 0-4", from, TZ)?.toISOString(),
    "2026-12-06T07:00:00.000Z",
  );
});

Deno.test("dom and dow both restricted match either", () => {
  // 1st of month OR Monday. From Thu 2026-12-03 -> Mon 2026-12-07
  const from = new Date("2026-12-03T10:00:00Z");
  assertStrictEquals(
    nextCronRun("0 9 1 * 1", from, TZ)?.toISOString(),
    "2026-12-07T07:00:00.000Z",
  );
});

Deno.test("DST gap: a non-existent local time is skipped", () => {
  // Israel springs forward on Friday 2027-03-26 02:00 -> 03:00.
  const from = new Date("2027-03-25T12:00:00Z");
  const next = nextCronRun("30 2 * * *", from, TZ);
  // 02:30 does not exist on 03-26, so the next run is 03-27 02:30 (UTC+3).
  assertStrictEquals(next?.toISOString(), "2027-03-26T23:30:00.000Z");
});

Deno.test("describeCronHe covers common presets", () => {
  assertStrictEquals(describeCronHe("0 9 * * *"), "כל יום ב-09:00");
  assertStrictEquals(describeCronHe("*/15 * * * *"), "כל 15 דקות");
  assertStrictEquals(describeCronHe("0 * * * *"), "כל שעה");
  assertStrictEquals(describeCronHe("0 8 * * 0"), "כל ראשון ב-08:00");
  assertStrictEquals(describeCronHe("0 9 * * 0-4"), "בימי חול (א׳–ה׳) ב-09:00");
  assertStrictEquals(describeCronHe("0 5,14 * * *"), "כל יום ב-05:00, 14:00");
});

Deno.test(
  "decideRecurringRun: due now runs and schedules the next slot",
  () => {
    const now = new Date("2026-12-01T07:00:30Z");
    const d = decideRecurringRun(
      {
        cron_expression: "0 9 * * *",
        timezone: TZ,
        next_run: "2026-12-01T07:00:00Z",
      },
      now,
    );
    assertStrictEquals(d.action, "run");
    assertStrictEquals(d.nextRun, "2026-12-02T07:00:00.000Z");
  },
);

Deno.test("decideRecurringRun: a stale slot is skipped, never replayed", () => {
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
  assertStrictEquals(d.action, "skip_stale");
  assertStrictEquals(d.nextRun, "2026-12-04T07:00:00.000Z");
});

Deno.test("decideRecurringRun: invalid cron", () => {
  const d = decideRecurringRun(
    { cron_expression: "nope", next_run: "2026-12-01T07:00:00Z" },
    new Date("2026-12-01T07:00:30Z"),
  );
  assertEquals(d, { action: "invalid", nextRun: null });
});

Deno.test("computeNextRun defaults to Israel time", () => {
  assertStrictEquals(
    computeNextRun("0 9 * * *", new Date("2026-12-01T05:00:00Z"), null),
    "2026-12-01T07:00:00.000Z",
  );
  assertStrictEquals(computeNextRun(null, new Date()), null);
});

Deno.test("freshOccurrenceResult drops the previous conversation", () => {
  const fresh = freshOccurrenceResult({
    conversation_history: [{ role: "user", content: "x" }],
    total_tool_calls: 12,
    notify: { surface: "whatsapp", chat_id: "1@c.us" },
    last_output: "ok",
    tool_log: ["a"],
  });
  assertEquals(fresh, {
    notify: { surface: "whatsapp", chat_id: "1@c.us" },
    last_output: "ok",
    conversation_history: [],
    total_tool_calls: 0,
  });
});
