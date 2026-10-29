import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { jerusalemYmd } from "../_shared/calendarTimeZone.ts";
import { taskOverdueNotifyAt, taskReminderAt } from "./schedule.ts";

// AIO-226 regression: a recurring occurrence is generated (and the worker
// invoked) when the previous one is marked done, so the one-off "day before"
// rule fired its reminder on the day BEFORE the task's own day.
Deno.test("onReminderDay: recurring occurrences", async (t) => {
  await t.step(
    "recurring task reminder goes out on the task's own Israel date, not the day before",
    () => {
      const reminder = taskReminderAt({
        priority: 5,
        created_at: "2026-10-26T15:00:00.000Z", // Monday's occurrence marked done
        due_date: "2026-10-27",
        due_time: "14:00:00",
        recurrence_frequency: "daily",
      });
      assert(reminder);
      assertStrictEquals(jerusalemYmd(reminder), "2026-10-27");
      assertStrictEquals(reminder.toISOString(), "2026-10-27T06:30:00.000Z"); // 08:30 IST
    },
  );

  await t.step(
    "recurring reminder around midnight lands on the due date at 08:30, not 00:00",
    () => {
      const reminder = taskReminderAt({
        priority: 5,
        created_at: "2026-10-26T21:50:00.000Z", // 23:50 Israel on the 26th
        due_date: "2026-10-27",
        due_time: null,
        recurrence_frequency: "daily",
      });
      assert(reminder);
      // 22:30Z on the 26th is already the 27th in Israel, but still before 08:30.
      assert(reminder.getTime() > Date.parse("2026-10-26T22:30:00.000Z"));
      assertStrictEquals(jerusalemYmd(reminder), "2026-10-27");
      assertStrictEquals(reminder.toISOString(), "2026-10-27T06:30:00.000Z");
    },
  );

  await t.step(
    "recurring reminder stays on its Israel date across the 25.10 DST change",
    () => {
      const at = (due_date: string) =>
        taskReminderAt({
          priority: 5,
          created_at: "2026-10-20T07:00:00.000Z",
          due_date,
          due_time: "10:00:00",
          recurrence_frequency: "weekly",
        })?.toISOString();
      assertStrictEquals(at("2026-10-22"), "2026-10-22T05:30:00.000Z"); // IDT, UTC+3
      assertStrictEquals(at("2026-10-25"), "2026-10-25T06:30:00.000Z"); // IST after 02:00
      assertStrictEquals(at("2026-10-26"), "2026-10-26T06:30:00.000Z");
      assertStrictEquals(at("2027-03-26"), "2027-03-26T05:30:00.000Z"); // DST starts that night
    },
  );

  await t.step(
    "urgent recurring occurrence is not reminded before its own day",
    () => {
      const reminder = taskReminderAt({
        priority: 9,
        created_at: "2026-10-26T08:00:00.000Z", // previous occurrence done at 10:00
        due_date: "2026-10-27",
        due_time: null,
        recurrence_previous_task_id: "previous-occurrence",
      });
      assertStrictEquals(reminder?.toISOString(), "2026-10-27T06:30:00.000Z");
    },
  );
});

Deno.test("onReminderDay: Shabbat", async (t) => {
  await t.step(
    "recurring task due on Saturday is reminded on Friday morning",
    () => {
      const reminder = taskReminderAt({
        priority: 5,
        created_at: "2026-10-24T09:00:00.000Z",
        due_date: "2026-10-31",
        due_time: "11:00:00",
        recurrence_frequency: "weekly",
      });
      assertStrictEquals(reminder?.toISOString(), "2026-10-30T06:30:00.000Z");
    },
  );

  await t.step(
    "one-off reminder that would fall on Saturday waits for Sunday 08:30",
    () => {
      const reminder = taskReminderAt({
        priority: 5,
        created_at: "2026-10-20T07:00:00.000Z",
        due_date: "2026-11-01", // Sunday 10:00, so the day-before slot is Saturday
        due_time: "10:00:00",
      });
      assertStrictEquals(reminder?.toISOString(), "2026-11-01T06:30:00.000Z");
      const urgent = taskReminderAt({
        priority: 9,
        created_at: "2026-10-30T16:00:00.000Z", // Friday 18:00 +5h = 23:00
        due_date: null,
        due_time: null,
      });
      assertStrictEquals(urgent?.toISOString(), "2026-11-01T06:30:00.000Z");
    },
  );
});

Deno.test("outsideShabbat", async (t) => {
  await t.step(
    "overdue notice for a Friday task waits for Sunday 08:30",
    () => {
      assertStrictEquals(
        taskOverdueNotifyAt({ due_date: "2026-10-30" })?.toISOString(),
        "2026-11-01T06:30:00.000Z",
      );
    },
  );
});
