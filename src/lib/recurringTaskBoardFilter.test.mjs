import { expect, test } from "vitest";
import { startOfDay } from "date-fns";
import {
  recurringTaskBelongsInBacklog,
  shouldShowRecurringTaskNow,
  shouldShowRecurringTaskOnBoard,
} from "./recurringTaskBoardFilter.ts";

const monday = startOfDay(new Date(2026, 8, 14));
const wednesday = startOfDay(new Date(2026, 8, 16));

test("recurring task hidden before due day", () => {
  const task = {
    recurrence_frequency: "weekly",
    due_date: "2026-09-16",
    due_time: "09:00:00",
    status: "open",
  };
  expect(shouldShowRecurringTaskNow(task, monday)).toBe(false);
  expect(shouldShowRecurringTaskNow(task, wednesday)).toBe(true);
});

test("recurring overdue still visible", () => {
  const task = {
    recurrence_frequency: "weekly",
    due_date: "2026-09-10",
    status: "open",
  };
  expect(shouldShowRecurringTaskNow(task, wednesday)).toBe(true);
  expect(recurringTaskBelongsInBacklog(task, wednesday)).toBe(true);
});

test("recurring untimed shows in backlog only on due day", () => {
  const task = {
    recurrence_frequency: "weekly",
    due_date: "2026-09-16",
    due_time: null,
    status: "open",
  };
  expect(recurringTaskBelongsInBacklog(task, monday)).toBe(false);
  expect(recurringTaskBelongsInBacklog(task, wednesday)).toBe(true);
});

test("non-recurring tasks are not filtered", () => {
  const task = { due_date: "2026-09-20", status: "open" };
  expect(shouldShowRecurringTaskNow(task, monday)).toBe(true);
});

test("showAllRecurring reveals future recurring tasks", () => {
  const task = {
    recurrence_frequency: "weekly",
    due_date: "2026-09-16",
    status: "open",
  };
  expect(
    shouldShowRecurringTaskOnBoard(task, {
      showAllRecurring: true,
      asOf: monday,
    }),
  ).toBe(true);
});

test("completed recurring task stays visible on due day only", () => {
  const task = {
    recurrence_frequency: "weekly",
    due_date: "2026-09-16",
    due_time: "09:00:00",
    status: "done",
  };
  expect(shouldShowRecurringTaskNow(task, wednesday)).toBe(true);
  expect(shouldShowRecurringTaskNow(task, monday)).toBe(false);
  expect(shouldShowRecurringTaskOnBoard(task, { asOf: wednesday })).toBe(true);
  expect(
    shouldShowRecurringTaskOnBoard(task, {
      showAllRecurring: true,
      asOf: wednesday,
    }),
  ).toBe(true);
  expect(
    shouldShowRecurringTaskOnBoard(task, {
      showAllRecurring: true,
      asOf: monday,
    }),
  ).toBe(false);
  expect(recurringTaskBelongsInBacklog(task, wednesday)).toBe(false);
});
