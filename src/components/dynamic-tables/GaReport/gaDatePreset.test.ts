import { describe, expect, it } from "vitest";

import { gaPresetRange, mapExternalGaPreset } from "./gaDatePreset";

const NOW = new Date(2026, 10, 10, 12);

describe("mapExternalGaPreset", () => {
  it("keeps a dashboard on the last 9 days instead of falling back to 7", () => {
    expect(mapExternalGaPreset("last_9_days")).toBe("last_9_days");
  });

  it("falls back to the last 7 days for a missing or unknown filter", () => {
    expect(mapExternalGaPreset(undefined)).toBe("last_7_days");
    expect(mapExternalGaPreset("last_8_days")).toBe("last_7_days");
  });
});

describe("gaPresetRange", () => {
  it("covers 9 days ending yesterday for the dashboard's last 9 days", () => {
    const { start, end } = gaPresetRange(
      mapExternalGaPreset("last_9_days"),
      NOW,
    );

    expect(start).toStrictEqual(new Date(2026, 10, 1, 23, 59, 59, 999));
    expect(end).toStrictEqual(new Date(2026, 10, 9, 23, 59, 59, 999));
  });

  it("keeps the last 7 days ending yesterday", () => {
    const { start, end } = gaPresetRange("last_7_days", NOW);

    expect(start).toStrictEqual(new Date(2026, 10, 3, 23, 59, 59, 999));
    expect(end).toStrictEqual(new Date(2026, 10, 9, 23, 59, 59, 999));
  });
});
