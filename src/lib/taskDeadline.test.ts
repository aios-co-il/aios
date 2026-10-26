import { expect, test } from "vitest";
import { getTaskDeadlineDate, isTaskOverdue } from "./taskDeadline.ts";

test("deadline prefers target_date over due_date", () => {
  expect(
    getTaskDeadlineDate({ target_date: "2026-08-30", due_date: "2026-08-24" }),
  ).toBe("2026-08-30");
  expect(getTaskDeadlineDate({ due_date: "2026-08-24" })).toBe("2026-08-24");
});

test("overdue uses target_date when set", () => {
  const today = new Date("2026-08-25T12:00:00");
  expect(
    isTaskOverdue(
      { target_date: "2026-08-24", due_date: "2026-08-30", status: "open" },
      today,
    ),
  ).toBe(true);
  expect(
    isTaskOverdue(
      { target_date: "2026-08-30", due_date: "2026-08-24", status: "open" },
      today,
    ),
  ).toBe(false);
});
