import { describe, expect, test } from "vitest";
import { AIOS_BRAND, BRAND_PRESETS } from "./brand";
import { contrastRatio, hslChannels, mix, readableOn } from "./color";
import { buildThemeTokens } from "./tokens";

describe("color", () => {
  test("converts brand hex to HSL channels", () => {
    expect(hslChannels("#0A1526")).toBe("216.4 58.3% 9.4%");
    expect(hslChannels("#FFFFFF")).toBe("0 0% 100%");
  });

  test("mixes two colors by weight", () => {
    expect(mix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mix("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  test("rejects malformed colors", () => {
    expect(() => hslChannels("green")).toThrow("Invalid hex color");
  });

  test("puts ink text on the bright green accent and white on blue", () => {
    expect(readableOn(AIOS_BRAND.accent, AIOS_BRAND.ink, "#FFFFFF")).toBe(
      AIOS_BRAND.ink,
    );
    expect(readableOn("#1D4ED8", AIOS_BRAND.ink, "#FFFFFF")).toBe("#FFFFFF");
  });
});

describe("buildThemeTokens", () => {
  test("light and dark expose the same token names", () => {
    const light = Object.keys(buildThemeTokens(AIOS_BRAND, "light")).sort();
    const dark = Object.keys(buildThemeTokens(AIOS_BRAND, "dark")).sort();
    expect(dark).toEqual(light);
  });

  test("the primary color follows the tenant accent", () => {
    const tokens = buildThemeTokens(BRAND_PRESETS.purple, "light");
    expect(tokens.primary).toBe(hslChannels(BRAND_PRESETS.purple.accent));
    expect(tokens.ring).toBe(tokens.primary);
  });

  test("every preset keeps readable text on its primary buttons", () => {
    for (const brand of Object.values(BRAND_PRESETS)) {
      const onAccent = readableOn(brand.accent, brand.ink, "#FFFFFF");
      expect(contrastRatio(brand.accent, onAccent)).toBeGreaterThan(2.5);
    }
  });

  test("body text meets WCAG AA on the page background in light mode", () => {
    expect(contrastRatio(AIOS_BRAND.ink, "#F6F5F2")).toBeGreaterThan(4.5);
    expect(
      contrastRatio(mix(AIOS_BRAND.ink, "#FFFFFF", 0.36), "#F6F5F2"),
    ).toBeGreaterThan(4.5);
  });
});

describe("accent scale", () => {
  test("dark steps stay readable as text on white for the bright accent", () => {
    const tokens = buildThemeTokens(AIOS_BRAND, "light");
    expect(tokens["brand-accent-500"]).toBe(hslChannels(AIOS_BRAND.accent));
    const step700 = mix(AIOS_BRAND.accent, AIOS_BRAND.ink, 0.5);
    expect(tokens["brand-accent-700"]).toBe(hslChannels(step700));
    expect(contrastRatio(step700, "#FFFFFF")).toBeGreaterThan(4.5);
  });
});
