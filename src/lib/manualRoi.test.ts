import { describe, expect, it } from "vitest";
import { hasManualRoiData } from "./manualRoi";

describe("hasManualRoiData", () => {
  it("is true once closures or revenue were entered", () => {
    expect(
      hasManualRoiData({ manual_roi: { closures: 3, revenue: null } }),
    ).toBe(true);
    expect(
      hasManualRoiData({ manual_roi: { closures: null, revenue: 0 } }),
    ).toBe(true);
  });

  it("is false when nothing was entered", () => {
    expect(hasManualRoiData(null)).toBe(false);
    expect(hasManualRoiData({ currency: "ILS" })).toBe(false);
    expect(
      hasManualRoiData({ manual_roi: { closures: null, revenue: null } }),
    ).toBe(false);
  });
});
