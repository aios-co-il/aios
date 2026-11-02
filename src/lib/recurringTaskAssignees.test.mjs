import { expect, test } from "vitest";
import {
  collectTaskAssigneeIds,
  shouldFanOutRecurringTasks,
} from "./recurringTaskAssignees.ts";

test("collectTaskAssigneeIds dedupes primary and collaborators", () => {
  expect(collectTaskAssigneeIds("a", ["b", "c", "a"])).toStrictEqual([
    "a",
    "b",
    "c",
  ]);
});

test("shouldFanOutRecurringTasks only when recurring and multiple assignees", () => {
  expect(shouldFanOutRecurringTasks("weekly", ["a", "b"])).toBe(true);
  expect(shouldFanOutRecurringTasks("weekly", ["a"])).toBe(false);
  expect(shouldFanOutRecurringTasks(null, ["a", "b"])).toBe(false);
});
