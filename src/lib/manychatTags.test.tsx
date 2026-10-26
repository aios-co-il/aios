import { describe, expect, it } from "vitest";
import { parseManyChatTags } from "./manychatTags";

describe("parseManyChatTags", () => {
  it("keeps tags with a numeric or string id", () => {
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

  it("returns an empty list for malformed payloads", () => {
    expect(parseManyChatTags(null)).toEqual([]);
    expect(parseManyChatTags({ tags: "x" })).toEqual([]);
    expect(parseManyChatTags({})).toEqual([]);
  });

  it("drops entries without an id and defaults a missing name", () => {
    expect(
      parseManyChatTags({ tags: [null, { name: "x" }, { id: 3 }] }),
    ).toEqual([{ id: 3, name: "" }]);
  });

  it("renders numeric names as text", () => {
    expect(parseManyChatTags({ tags: [{ id: 4, name: 7 }] })).toEqual([
      { id: 4, name: "7" },
    ]);
  });
});
