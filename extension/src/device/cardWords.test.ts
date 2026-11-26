import { describe, expect, it } from "vitest";
import {
  clickCardWords,
  navigateCardWords,
  readCardWords,
  typeCardWords,
} from "./cardWords.ts";

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

  it("names the element and the site on a click card, with where the page says it leads", () => {
    const words = clickCardWords({
      host: "shop.example",
      role: "link",
      name: "Checkout",
      destination: "https://shop.example/pay",
    });

    expect(words.title).toBe(
      'כרמן מבקשת ללחוץ על "\u2068Checkout\u2069" באתר shop.example',
    );
    expect(words.address).toBe("https://shop.example/pay");
    expect(words.quote).toBeNull();
    expect(words.allow).toBe("ללחוץ");
  });

  it("names a nameless element by its role", () => {
    const words = clickCardWords({
      host: "shop.example",
      role: "button",
      name: "  ",
      destination: null,
    });

    expect(words.title).toBe(
      "כרמן מבקשת ללחוץ על (\u2068button\u2069 ללא שם) באתר shop.example",
    );
    expect(words.address).toBeNull();
  });

  it("strips direction controls a page put in a name, so it cannot reorder the card", () => {
    const words = clickCardWords({
      host: "shop.example",
      role: "button",
      name: "\u202Egnp.exe\u202C\u200B Pay",
      destination: null,
    });

    expect(words.title).not.toMatch(/[\u202A-\u202E\u200B]/);
    expect(words.title).toContain("gnp.exe Pay");
  });

  it("shows the full text on a typing card, with the field and the site", () => {
    const words = typeCardWords({
      host: "shop.example",
      role: "textbox",
      name: "Full name",
      text: "Dana Levi\nline two",
    });

    expect(words.title).toBe(
      'כרמן מבקשת להקליד בשדה "\u2068Full name\u2069" באתר shop.example',
    );
    expect(words.quote).toBe("Dana Levi\nline two");
    expect(words.address).toBeNull();
    expect(words.allow).toBe("להקליד");
  });
});
