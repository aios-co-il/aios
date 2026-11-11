import { describe, expect, it } from "vitest";
import { normalizeHex } from "@/components/ui/colorHex";

describe("normalizeHex", () => {
  it("normalizes 3- and 6-digit input to lowercase #rrggbb", () => {
    expect(normalizeHex("#3B82F6")).toBe("#3b82f6");
    expect(normalizeHex(" 3b82f6 ")).toBe("#3b82f6");
    expect(normalizeHex("F60")).toBe("#ff6600");
  });

  it("rejects anything that is not a hex color", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#gggggg")).toBeNull();
  });
});
