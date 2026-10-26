import { expect, test } from "vitest";
import { priorityBarColor } from "./taskPriority.ts";

test("priority bar goes blue → green → yellow → orange → red", () => {
  expect(priorityBarColor(1)).toBe("#3b82f6");
  expect(priorityBarColor(2)).toBe("#3b82f6");
  expect(priorityBarColor(3)).toBe("#22c55e");
  expect(priorityBarColor(5)).toBe("#eab308");
  expect(priorityBarColor(8)).toBe("#f97316");
  expect(priorityBarColor(10)).toBe("#ef4444");
});
