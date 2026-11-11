import { describe, expect, it } from "vitest";
import { softColorChipStyle } from "./softColorChip";

describe("softColorChipStyle", () => {
  it("tints the chip with the chosen colour", () => {
    expect(softColorChipStyle("#40CE80")).toEqual({
      backgroundColor: "color-mix(in srgb, #40CE80 14%, transparent)",
      borderColor: "color-mix(in srgb, #40CE80 45%, transparent)",
    });
  });

  it("leaves the chip unstyled without a colour", () => {
    expect(softColorChipStyle(null)).toBeUndefined();
    expect(softColorChipStyle("")).toBeUndefined();
  });
});
