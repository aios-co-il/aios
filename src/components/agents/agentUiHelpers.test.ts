import { describe, expect, it } from "vitest";
import { isOneOf, thrownMessage } from "./agentUiHelpers";
describe("agentUiHelpers", () => {
  it("isOneOf narrows to the listed values", () => {
    const kinds = ["edge", "mcp"] as const;
    expect(isOneOf(kinds, "edge")).toBe(true);
    expect(isOneOf(kinds, "other")).toBe(false);
  });

  it("thrownMessage reads message from error-like values", () => {
    expect(thrownMessage(new Error("boom"))).toBe("boom");
    expect(thrownMessage({ message: "pg error", code: "42" })).toBe("pg error");
    expect(thrownMessage("plain")).toBe(undefined);
    expect(thrownMessage(null)).toBe(undefined);
    expect(thrownMessage({ message: 42 })).toBe(undefined);
    expect(thrownMessage({ message: undefined })).toBe(undefined);
    expect(thrownMessage({ code: "x" })).toBe(undefined);
  });
});
