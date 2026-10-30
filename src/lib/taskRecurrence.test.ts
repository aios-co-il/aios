import { expect, test } from "vitest";
import {
  computeFirstOccurrenceDate,
  computeNextRecurrenceDate,
  describeRecurrence,
  formatLocalDate,
} from "./taskRecurrence.ts";

test("weekly recurrence lands on the chosen weekday", () => {
  const next = computeNextRecurrenceDate({
    frequency: "weekly",
    weekday: 1, // Monday
    fromDate: new Date(2026, 8, 13), // Sunday
    asOf: new Date(2026, 8, 13),
  });
  expect(next.getDay()).toBe(1);
  expect(formatLocalDate(next)).toBe("2026-09-21");
});

test("monthly recurrence clamps short months", () => {
  const next = computeNextRecurrenceDate({
    frequency: "monthly",
    monthday: 31,
    fromDate: new Date(2026, 0, 31),
    asOf: new Date(2026, 0, 31),
  });
  expect(formatLocalDate(next)).toBe("2026-02-28");
});

test("describeRecurrence includes day and time", () => {
  expect(
    describeRecurrence({
      frequency: "weekly",
      weekday: 2,
      time: "09:00:00",
    }),
  ).toBe("כל שבוע · יום שלישי · ב־09:00");
});

test("first weekly occurrence can be today when weekday matches", () => {
  const monday = new Date(2026, 8, 14); // Monday
  expect(monday.getDay()).toBe(1);
  const first = computeFirstOccurrenceDate({
    frequency: "weekly",
    weekday: 1,
    asOf: monday,
  });
  expect(formatLocalDate(first)).toBe("2026-09-14");
});
