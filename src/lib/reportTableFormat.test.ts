import { describe, expect, it } from "vitest";
import {
  formatReportNumber,
  ratio,
  resultCellClass,
} from "./reportTableFormat";

describe("formatReportNumber", () => {
  it("groups thousands and rounds to the given digits", () => {
    expect(formatReportNumber(12345.678)).toBe("12,346");
    expect(formatReportNumber(3.14159, 2)).toBe("3.14");
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
