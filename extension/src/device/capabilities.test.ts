import { describe, expect, it } from "vitest";
import { capabilitiesMessage } from "./capabilities.ts";

describe("capabilitiesMessage", () => {
  it("offers the read and the navigation only while tab sharing is on", () => {
    expect(capabilitiesMessage(true)).toMatchObject({
      capabilities: ["tab-context", "browser_read_page", "browser_navigate"],
    });
    expect(capabilitiesMessage(false)).toMatchObject({
      capabilities: ["tab-context"],
    });
  });
});
