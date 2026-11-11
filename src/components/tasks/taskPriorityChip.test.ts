import { describe, expect, test } from "vitest";
import { taskPriorityChip } from "./taskPriorityChip";

describe("taskPriorityChip", () => {
  test("marks priority 8 and above as urgent", () => {
    expect(taskPriorityChip(8)).toEqual({ tone: "danger", label: "דחופה" });
    expect(taskPriorityChip(10)).toEqual({ tone: "danger", label: "דחופה" });
  });

  test("marks priority 6–7 as high", () => {
    expect(taskPriorityChip(6)).toEqual({ tone: "progress", label: "גבוהה" });
    expect(taskPriorityChip(7)).toEqual({ tone: "progress", label: "גבוהה" });
  });

  test("leaves the default and lower priorities without a chip", () => {
    expect(taskPriorityChip(5)).toBeNull();
    expect(taskPriorityChip(1)).toBeNull();
  });
});
