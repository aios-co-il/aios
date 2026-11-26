import { describe, expect, it } from "vitest";
import { navigateCardWords, readCardWords } from "./cardWords.ts";

describe("cardWords", () => {
  it("names the site a read card asks about", () => {
    expect(readCardWords("shop.example").title).toBe(
      "כרמן מבקשת לקרוא את הדף באתר shop.example",
    );
  });

  it("names the destination's host, the tab's site and the full address, isolated left to right", () => {
    const words = navigateCardWords({
      fromHost: "shop.example",
      host: "store.example",
      href: "https://store.example/cart",
    });

    expect(words.title).toBe("כרמן מבקשת לעבור לאתר store.example");
    expect(words.text).toContain("shop.example");
    expect(words.text).toContain("⁦https://store.example/cart⁩");
    expect(words.allow).toBe("לעבור לאתר");
  });
});
