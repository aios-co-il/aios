import { describe, expect, it } from "vitest";
import { readCollectedPage } from "./collectedPage.ts";

describe("readCollectedPage", () => {
  it("accepts the collector's shape and nothing else", () => {
    expect(
      readCollectedPage({
        origin: "https://shop.example",
        text: "t",
        elements: [{ role: "link", name: "n", x: 1 }],
      }),
    ).toEqual({
      origin: "https://shop.example",
      text: "t",
      elements: [{ role: "link", name: "n" }],
    });
    for (const value of [
      null,
      "t",
      { text: 1, elements: [] },
      { text: "t" },
      { text: "t", elements: [{ role: 1 }] },
      { text: "t", elements: [] },
      { origin: 1, text: "t", elements: [] },
    ]) {
      expect(readCollectedPage(value)).toBeNull();
    }
  });
});
