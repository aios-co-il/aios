import { describe, expect, it } from "vitest";
import { continentsFallbackFilter } from "./continentsFallback";

describe("continentsFallbackFilter", () => {
  it("returns to Google Ads when the dashboard has it", () => {
    expect(continentsFallbackFilter(["facebook", "google_ads"])).toBe(
      "google_ads",
    );
  });

  it("returns a Meta-only dashboard to all platforms, not a missing Google tab", () => {
    expect(continentsFallbackFilter(["facebook"])).toBe("all");
  });
});
