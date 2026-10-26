import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import { readSliderColor, sliderColorStyle } from "./sliderColor-b26";

describe("slider color CSS variable", () => {
  it("round-trips the --slider-color custom property", () => {
    expect(readSliderColor(sliderColorStyle("#ef4444"))).toBe("#ef4444");
  });

  it("ignores styles without a string --slider-color", () => {
    const numeric: CSSProperties & { "--slider-color": number } = {
      "--slider-color": 5,
    };
    expect(readSliderColor(undefined)).toBeUndefined();
    expect(readSliderColor({ color: "red" })).toBeUndefined();
    expect(readSliderColor(numeric)).toBeUndefined();
  });
});
