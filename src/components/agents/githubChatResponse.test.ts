import { describe, expect, it } from "vitest";
import { parseChatSupportResponse } from "./githubChatResponse";

describe("parseChatSupportResponse", () => {
  it("reads the reply fields", () => {
    expect(
      parseChatSupportResponse({
        response: "fixed",
        action_needed: "deploy",
        requires_approval: true,
        severity: "high",
        extra: 1,
      }),
    ).toEqual({
      response: "fixed",
      action_needed: "deploy",
      requires_approval: true,
      severity: "high",
    });
  });

  it("drops unrenderable fields and keeps the rest", () => {
    expect(
      parseChatSupportResponse({ response: { nested: true }, severity: 2 }),
    ).toEqual({
      response: undefined,
      action_needed: undefined,
      requires_approval: false,
      severity: "2",
    });
  });

  it("reads requires_approval as a boolean, not by truthiness", () => {
    const approval = (requires_approval: unknown) =>
      parseChatSupportResponse({ requires_approval })?.requires_approval;
    expect(approval(true)).toBe(true);
    expect(approval("true")).toBe(true);
    expect(approval("false")).toBe(false);
    expect(approval(1)).toBe(false);
    expect(approval(undefined)).toBe(false);
  });

  it("returns null for non-object bodies", () => {
    for (const data of [null, undefined, "text", 3, ["x"]]) {
      expect(parseChatSupportResponse(data)).toBe(null);
    }
  });
});
