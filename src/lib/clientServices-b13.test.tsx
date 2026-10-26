import { describe, expect, it } from "vitest";
import { parseClientServices } from "./clientServices-b13";

describe("parseClientServices", () => {
  it("returns service codes from a JSON array", () => {
    expect(parseClientServices(["seo", "ppc_meta"])).toEqual([
      "seo",
      "ppc_meta",
    ]);
  });

  it("parses legacy JSON string values", () => {
    expect(parseClientServices('["social"]')).toEqual(["social"]);
  });

  it("returns an empty list for empty or malformed values", () => {
    expect(parseClientServices(null)).toEqual([]);
    expect(parseClientServices(undefined)).toEqual([]);
    expect(parseClientServices("not json")).toEqual([]);
    expect(parseClientServices('{"seo":true}')).toEqual([]);
    expect(parseClientServices({ seo: true })).toEqual([]);
    expect(parseClientServices(["seo", 3, null])).toEqual(["seo"]);
  });
});
