import { describe, expect, it } from "vitest";
import { grantsToDrop, sitePattern } from "./siteGrant.ts";

describe("sitePattern", () => {
  it("asks for one https host on any path", () => {
    expect(sitePattern("shop.example")).toBe("https://shop.example/*");
  });
});

describe("grantsToDrop", () => {
  it("drops every site grant but the manifest's own host permissions", () => {
    const required = ["https://api.aios.co.il/*", "https://aios.co.il/*"];

    expect(
      grantsToDrop(
        [
          "https://aios.co.il/*",
          "https://shop.example/*",
          "https://news.example/*",
        ],
        required,
      ),
    ).toEqual(["https://shop.example/*", "https://news.example/*"]);
    expect(grantsToDrop(required, required)).toEqual([]);
  });
});
