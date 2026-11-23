import { describe, expect, it } from "vitest";
import { parseColumnOrder } from "./legacyLeadColumnOrder";

describe("parseColumnOrder", () => {
  it("keeps string ids and ignores malformed values", () => {
    expect(parseColumnOrder('["phone","name"]')).toEqual(["phone", "name"]);
    expect(parseColumnOrder("{bad")).toEqual([]);
    expect(parseColumnOrder('{"a":1}')).toEqual([]);
    expect(parseColumnOrder('["a",2,"b"]')).toEqual(["a", "b"]);
    expect(parseColumnOrder(null)).toEqual([]);
  });
});
