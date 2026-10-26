import { describe, expect, it } from "vitest";
import { toSessionMessages } from "./sessionMessages";

describe("toSessionMessages", () => {
  it("returns an empty list for non-array values", () => {
    expect(toSessionMessages(null)).toEqual([]);
    expect(toSessionMessages(undefined)).toEqual([]);
    expect(toSessionMessages({ role: "user" })).toEqual([]);
  });

  it("keeps role, content and timestamp of object entries", () => {
    expect(
      toSessionMessages([
        { role: "user", content: "hi", timestamp: "2026-01-01T00:00:00Z" },
        { role: "assistant", content: "hello" },
      ]),
    ).toEqual([
      { role: "user", content: "hi", timestamp: "2026-01-01T00:00:00Z" },
      { role: "assistant", content: "hello", timestamp: undefined },
    ]);
  });

  it("skips non-object entries and blanks non-string fields", () => {
    expect(toSessionMessages(["x", null, { role: 1, content: [] }])).toEqual([
      { role: "", content: "", timestamp: undefined },
    ]);
  });
});
