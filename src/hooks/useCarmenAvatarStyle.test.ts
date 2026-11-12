import { describe, expect, test } from "vitest";
import { parseStyle } from "./useCarmenAvatarStyle";

describe("parseStyle", () => {
  test("reads a stored style", () => {
    expect(parseStyle({ style: "character" })).toBe("character");
    expect(parseStyle({ style: "orbs" })).toBe("orbs");
    expect(parseStyle({ style: "minime" })).toBe("minime");
  });

  test("falls back to the Mini Me when nothing valid is stored", () => {
    expect(parseStyle(null)).toBe("orbs");
    expect(parseStyle({ style: "hologram" })).toBe("orbs");
    expect(parseStyle("character")).toBe("orbs");
  });
});
