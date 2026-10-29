import { expect, test } from "vitest";
import { formatDateTime } from "./formatDateTime.ts";

test("formats a Date as day/month/year hours:minutes", () => {
  expect(formatDateTime(new Date(2026, 9, 22, 9, 5))).toBe("22/10/2026 09:05");
});

test("accepts an ISO string and a timestamp", () => {
  const local = new Date(2026, 0, 3, 14, 30);
  expect(formatDateTime(local.toISOString())).toBe("03/01/2026 14:30");
  expect(formatDateTime(local.getTime())).toBe("03/01/2026 14:30");
});

test("returns an empty string for missing or unreadable values", () => {
  expect(formatDateTime(null)).toBe("");
  expect(formatDateTime(undefined)).toBe("");
  expect(formatDateTime("")).toBe("");
  expect(formatDateTime("not a date")).toBe("");
});
