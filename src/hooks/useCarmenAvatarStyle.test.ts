import { describe, expect, test } from "vitest";
import { parseStyle } from "./useCarmenAvatarStyle";

describe("parseStyle", () => {
  test("reads a stored style", () => {
    expect(parseStyle({ style: "character" })).toBe("character");
    expect(parseStyle({ style: "orbs" })).toBe("orbs");
  });

  test("falls back to orbs when nothing valid is stored", () => {
    expect(parseStyle(null)).toBe("orbs");
    expect(parseStyle({ style: "hologram" })).toBe("orbs");
    expect(parseStyle("character")).toBe("orbs");
  });
});
