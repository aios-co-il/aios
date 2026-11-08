import { describe, expect, it } from "vitest";
import { readMakeApiSettings, toLangFilter } from "./dynamicTableTypes";

describe("toLangFilter", () => {
  it("falls back to all for unknown values", () => {
    expect(toLangFilter("he")).toBe("he");
    expect(toLangFilter("en")).toBe("en");
    expect(toLangFilter("fr")).toBe("all");
    expect(toLangFilter(undefined)).toBe("all");
  });
});

describe("readMakeApiSettings", () => {
  it("keeps string and numeric ids and drops mistyped fields", () => {
    expect(
      readMakeApiSettings({
        api_token: "tok",
        team_id: 12,
        region: "us1",
        google_ads_template_scenario_id: "77",
        extra: true,
      }),
    ).toEqual({
      api_token: "tok",
      team_id: 12,
      region: "us1",
      google_ads_template_scenario_id: "77",
    });
    expect(readMakeApiSettings({ api_token: 5, team_id: true })).toEqual({
      api_token: undefined,
      team_id: undefined,
      region: undefined,
      google_ads_template_scenario_id: undefined,
    });
    expect(readMakeApiSettings(null).api_token).toBeUndefined();
  });
});
