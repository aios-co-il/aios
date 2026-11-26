import { describe, expect, it } from "vitest";
import { navigateCardWords, readCardWords } from "./cardWords.ts";

describe("cardWords", () => {
  it("names the site a read card asks about", () => {
    expect(readCardWords("shop.example")).toMatchObject({
      title: "כרמן מבקשת לקרוא את הדף באתר shop.example",
      address: null,
    });
  });

  it("names the destination's host, the tab's site and the full address on a line of its own", () => {
    const words = navigateCardWords({
      fromHost: "shop.example",
      host: "store.example",
      href: "https://store.example/cart",
    });

    expect(words.title).toBe("כרמן מבקשת לעבור לאתר store.example");
    expect(words.text).toContain("shop.example");
    expect(words.address).toBe("https://store.example/cart");
    expect(words.allow).toBe("לעבור לאתר");
  });
});
