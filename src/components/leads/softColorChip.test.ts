import { describe, expect, it } from "vitest";
import { softColorChipStyle, solidColorChipStyle } from "./softColorChip";

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

describe("solidColorChipStyle", () => {
  it("fills the chip with the exact chosen colour and white text", () => {
    expect(solidColorChipStyle("#40CE80")).toEqual({
      backgroundColor: "#40CE80",
      borderColor: "#40CE80",
      color: "#fff",
    });
  });

  it("leaves the chip unstyled without a colour", () => {
    expect(solidColorChipStyle(undefined)).toBeUndefined();
  });
});
