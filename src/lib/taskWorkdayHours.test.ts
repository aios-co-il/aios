import { expect, test } from "vitest";
import {
  generateWorkdayTimeSlots,
  workdaySlotIndex,
} from "./taskWorkdayHours.ts";

test("workday slots run from 07:00 through 19:00", () => {
  const slots = generateWorkdayTimeSlots();
  expect(slots[0]).toBe("07:00");
  expect(slots[1]).toBe("07:30");
  expect(slots[slots.length - 1]).toBe("19:00");
  expect(slots.includes("00:00")).toBe(false);
  expect(slots.includes("23:30")).toBe(false);
  expect(slots.includes("06:30")).toBe(false);
  expect(slots.includes("19:30")).toBe(false);
});

test("workdaySlotIndex is relative to 07:00", () => {
  expect(workdaySlotIndex("07:00")).toBe(0);
  expect(workdaySlotIndex("07:30")).toBe(1);
  expect(workdaySlotIndex("10:00")).toBe(6);
});
