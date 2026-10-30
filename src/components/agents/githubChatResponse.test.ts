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

  it("returns null for non-object bodies", () => {
    for (const data of [null, undefined, "text", 3, ["x"]]) {
      expect(parseChatSupportResponse(data)).toBe(null);
    }
  });
});
