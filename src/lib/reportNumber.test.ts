import { describe, expect, it } from "vitest";
import { formatReportNumber } from "./reportNumber";

describe("formatReportNumber", () => {
  it("rounds to whole numbers by default and groups thousands", () => {
    expect(formatReportNumber(1234.6)).toBe("1,235");
  });

  it("keeps up to the given fraction digits", () => {
    expect(formatReportNumber(2.345, 2)).toBe("2.35");
    expect(formatReportNumber(3, 1)).toBe("3");
  });
});
