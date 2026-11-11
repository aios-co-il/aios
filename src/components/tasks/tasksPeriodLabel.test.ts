import { describe, expect, test } from "vitest";
import { tasksPeriodLabel } from "./tasksPeriodLabel";

describe("tasksPeriodLabel", () => {
  test("names the day in the daily view", () => {
    const date = new Date(2026, 10, 11);
    expect(tasksPeriodLabel("daily", date)).toBe("יום רביעי, 11 בנובמבר 2026");
    expect(tasksPeriodLabel("daily", date, { short: true })).toBe(
      "יום רביעי, 11/11",
    );
  });

  test("names the seven days of the weekly view", () => {
    expect(tasksPeriodLabel("weekly", new Date(2026, 10, 11))).toBe(
      "11–17 בנובמבר 2026",
    );
    expect(tasksPeriodLabel("weekly", new Date(2026, 10, 28))).toBe(
      "28 בנובמבר – 4 בדצמבר 2026",
    );
  });

  test("names the month in the monthly view and nothing in chat", () => {
    const date = new Date(2026, 10, 11);
    expect(tasksPeriodLabel("monthly", date)).toBe("נובמבר 2026");
    expect(tasksPeriodLabel("chat", date)).toBe("");
  });
});
