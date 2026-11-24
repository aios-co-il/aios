import { assertEquals } from "jsr:@std/assert@1";
import { recurringScheduleFor } from "./recurring-schedule.ts";

// Saturday 21 Nov 2026, 10:00 in Israel (UTC+2).
const NOW = new Date("2026-11-21T08:00:00Z");

Deno.test("recurringScheduleFor", async (t) => {
  await t.step("a one-off task has no recurring schedule", () => {
    assertEquals(
      recurringScheduleFor({ scheduled_at: "2026-11-27T14:00:00Z" }, NOW),
      null,
    );
    assertEquals(recurringScheduleFor({ schedule_type: "once" }, NOW), null);
  });

  await t.step(
    "a weekly task repeats at the Israel hour and weekday of scheduled_at",
    () => {
      assertEquals(
        recurringScheduleFor(
          {
            schedule_type: "weekly",
            scheduled_at: "2026-11-13T14:00:00Z",
            // What Carmen sent for "Friday 16:00": the hour in UTC.
            cron_expression: "0 14 * * 5",
          },
          NOW,
        ),
        {
          cron_expression: "0 16 * * 5",
          timezone: "Asia/Jerusalem",
          next_run: "2026-11-27T14:00:00.000Z",
        },
      );
    },
  );

  await t.step(
    "a daily task keeps its Israel hour across the clock change",
    () => {
      const schedule = recurringScheduleFor(
        { schedule_type: "daily", scheduled_at: "2026-11-12T05:30:00Z" },
        new Date("2027-06-01T12:00:00Z"),
      );

      assertEquals(schedule?.cron_expression, "30 7 * * *");
      // 07:30 in Israel summer time (UTC+3).
      assertEquals(schedule?.next_run, "2027-06-02T04:30:00.000Z");
    },
  );

  await t.step(
    "without scheduled_at a valid cron is kept as Israel time",
    () => {
      assertEquals(
        recurringScheduleFor(
          { schedule_type: "weekly", cron_expression: " 0 16 * * 5 " },
          NOW,
        ),
        {
          cron_expression: "0 16 * * 5",
          timezone: "Asia/Jerusalem",
          next_run: "2026-11-27T14:00:00.000Z",
        },
      );
    },
  );

  await t.step(
    "with no time given it repeats at the hour it was created",
    () => {
      assertEquals(
        recurringScheduleFor(
          {
            schedule_type: "weekly",
            scheduled_at: "soon",
            cron_expression: "x",
          },
          NOW,
        ),
        {
          cron_expression: "0 10 * * 6",
          timezone: "Asia/Jerusalem",
          next_run: "2026-11-28T08:00:00.000Z",
        },
      );
    },
  );
});
