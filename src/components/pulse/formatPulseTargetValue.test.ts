import { describe, expect, it } from "vitest";
import { formatPulseTargetValue } from "./formatPulseTargetValue";

describe("formatPulseTargetValue", () => {
  it("shows ROAS as a ratio, a cost as money and a missing value as a dash", () => {
    expect(formatPulseTargetValue("roas", 3)).toBe("3.00");
    expect(formatPulseTargetValue("cpa", 80)).toBe("₪80");
    expect(formatPulseTargetValue("cpl", null)).toBe("—");
  });
});
