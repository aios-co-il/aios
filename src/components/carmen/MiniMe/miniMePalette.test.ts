import { describe, expect, it } from "vitest";
import { miniMePalette } from "./miniMePalette";

describe("miniMePalette", () => {
  it("shades a skin tint into light, mid, dark and hands", () => {
    expect(miniMePalette("330 81% 60%")).toEqual({
      light: "hsl(330 81% 90%)",
      mid: "hsl(330 81% 60%)",
      dark: "hsl(330 81% 27%)",
      limb: "hsl(330 81% 47%)",
    });
  });

  it("follows the brand accent without a tint, or with one that does not parse", () => {
    expect(miniMePalette(null).mid).toBe("hsl(var(--brand-accent))");
    expect(miniMePalette("not a color").mid).toBe("hsl(var(--brand-accent))");
  });
});
