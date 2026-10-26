import { describe, expect, it } from "vitest";
import {
  asJsonObject,
  errorMessage,
  jsonField,
  jsonText,
  readMakeApiSettings,
} from "./dynamic-tables-b19";

describe("asJsonObject / jsonField / jsonText", () => {
  it("returns plain objects and rejects arrays, primitives and null", () => {
    expect(asJsonObject({ a: 1 })).toEqual({ a: 1 });
    expect(asJsonObject([1, 2])).toBeNull();
    expect(asJsonObject("x")).toBeNull();
    expect(asJsonObject(null)).toBeNull();
    expect(asJsonObject(undefined)).toBeNull();
  });

  it("reads raw and text fields", () => {
    expect(jsonField({ error: "boom" }, "error")).toBe("boom");
    expect(jsonField("not-an-object", "error")).toBeUndefined();
    expect(jsonText({ currency: "USD" }, "currency")).toBe("USD");
    expect(jsonText({ currency: 5 }, "currency")).toBeUndefined();
  });
});

describe("errorMessage", () => {
  it("reads message from Error and error-like objects", () => {
    expect(errorMessage(new Error("bad"))).toBe("bad");
    expect(errorMessage({ message: "pg failure", code: "42" })).toBe(
      "pg failure",
    );
  });

  it("returns undefined for values without a string message", () => {
    expect(errorMessage("plain string")).toBeUndefined();
    expect(errorMessage({ message: 42 })).toBeUndefined();
    expect(errorMessage(null)).toBeUndefined();
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
