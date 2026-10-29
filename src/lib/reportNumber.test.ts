import { describe, expect, it } from "vitest";
import { formatReportNumber, ratio, resultCellClass } from "./reportNumber";

describe("formatReportNumber", () => {
  it("rounds to whole numbers by default and groups thousands", () => {
    expect(formatReportNumber(1234.6)).toBe("1,235");
  });

  it("keeps up to the given fraction digits", () => {
    expect(formatReportNumber(2.345, 2)).toBe("2.35");
    expect(formatReportNumber(3, 1)).toBe("3");
  });
});

describe("ratio", () => {
  it("divides, or is 0 with nothing to divide by", () => {
    expect(ratio(120, 30)).toBe(4);
    expect(ratio(120, 0)).toBe(0);
  });
});

describe("resultCellClass", () => {
  it("adds font-medium on entity rows only", () => {
    expect(resultCellClass("text-blue-600", false)).toBe(
      "p-2 text-center text-blue-600 font-medium",
    );
    expect(resultCellClass("text-blue-600", true)).toBe(
      "p-2 text-center text-blue-600",
    );
  });
});
