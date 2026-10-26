import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  actionStatusSource,
  integrationInstanceSuffix,
  parseConditionsObject,
  parseManyChatTags,
  parseOrUndefined,
  triggerFilterSource,
} from "./automationFormHelpers";

describe("parseManyChatTags", () => {
  it("returns tags with string or numeric ids", () => {
    expect(
      parseManyChatTags({
        tags: [
          { id: 1, name: "VIP" },
          { id: "2", name: "Lead" },
        ],
      }),
    ).toEqual([
      { id: 1, name: "VIP" },
      { id: "2", name: "Lead" },
    ]);
  });

  it("returns an empty list when the payload has no tags array", () => {
    expect(parseManyChatTags(null)).toEqual([]);
    expect(parseManyChatTags({ tags: "nope" })).toEqual([]);
  });

  it("drops malformed tag entries", () => {
    expect(
      parseManyChatTags({ tags: [null, { name: "no id" }, { id: 3 }] }),
    ).toEqual([{ id: 3, name: "" }]);
  });
});

describe("integrationInstanceSuffix", () => {
  it("prefers idInstance and falls back to instanceId", () => {
    expect(integrationInstanceSuffix({ idInstance: "1101234567" })).toBe(
      "4567",
    );
    expect(integrationInstanceSuffix({ instanceId: "abcd9876" })).toBe("9876");
    expect(integrationInstanceSuffix(null)).toBeUndefined();
  });
});

describe("parseConditionsObject", () => {
  it("parses a JSON object", () => {
    expect(parseConditionsObject('{"new_status":"won"}', "bad")).toEqual({
      new_status: "won",
    });
  });

  it("rejects invalid JSON and non-object JSON", () => {
    expect(() => parseConditionsObject("{", "bad")).toThrow("bad");
    expect(() => parseConditionsObject("[1]", "bad")).toThrow("bad");
    expect(() => parseConditionsObject("null", "bad")).toThrow("bad");
  });
});

describe("parseOrUndefined", () => {
  it("returns the parsed value or undefined", () => {
    const schema = z.enum(["POST", "GET"]);
    expect(parseOrUndefined(schema, "GET")).toBe("GET");
    expect(parseOrUndefined(schema, "PATCH")).toBeUndefined();
  });
});

describe("status sources", () => {
  it("reads string status fields from stored JSON", () => {
    expect(
      triggerFilterSource({ new_status: "won", status_kind: 5 }),
    ).toMatchObject({ new_status: "won", status_kind: undefined });
    expect(actionStatusSource({ status: "won", entity: "lead" })).toEqual({
      status: "won",
      status_field: undefined,
      entity: "lead",
    });
    expect(actionStatusSource(null)).toBeNull();
  });
});
