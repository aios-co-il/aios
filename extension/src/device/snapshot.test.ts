import { describe, expect, it } from "vitest";
import {
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
} from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { toolResult } from "../../../supabase/functions/carmen-device-action/result.ts";
import {
  cutAtCodePoint,
  oneLineUpTo,
  pageSnapshot,
  refIndex,
  textUpTo,
} from "./snapshot.ts";

const EMOJI = "😀";

/** A snapshot of `text` and `elements` on a fixed page. */
function snapshotOf(
  text: string,
  elements: Array<{ role: string; name: string }> = [],
) {
  return pageSnapshot({
    location: { origin: "https://shop.example", path: "/items" },
    tabTitle: "Items",
    page: { origin: "https://shop.example", text, elements },
    snapshotId: "snap-1",
  });
}

describe("cutAtCodePoint", () => {
  it("never ends on the first half of a surrogate pair", () => {
    const cut = cutAtCodePoint(`ab${EMOJI}`, 3);

    expect(cut).toBe("ab");
    expect(cut.isWellFormed()).toBe(true);
  });

  it("keeps a whole pair that fits and leaves short text alone", () => {
    expect(cutAtCodePoint(`ab${EMOJI}c`, 4)).toBe(`ab${EMOJI}`);
    expect(cutAtCodePoint("abc", 10)).toBe("abc");
  });
});

describe("textUpTo", () => {
  it("collapses spaces and blank lines and drops control characters", () => {
    expect(textUpTo("  one \t two\u0000\r\n\n\n  three\u0007  ", 100)).toBe(
      "one two\nthree",
    );
  });

  it("replaces a lone surrogate the server would refuse", () => {
    expect(textUpTo("a\uD800b", 10).isWellFormed()).toBe(true);
  });

  it("cuts to the limit in UTF-16 units on a code-point boundary", () => {
    const text = textUpTo(
      `${"a".repeat(READ_PAGE_TEXT_MAX - 1)}${EMOJI}tail`,
      READ_PAGE_TEXT_MAX,
    );

    expect(text).toBe("a".repeat(READ_PAGE_TEXT_MAX - 1));
  });
});

describe("oneLineUpTo", () => {
  it("flattens a title to one line within its limit", () => {
    expect(oneLineUpTo(" Big\nsale\t now ", 8)).toBe("Big sale");
  });
});

describe("pageSnapshot", () => {
  it("builds the result the server accepts for a read", () => {
    const snapshot = snapshotOf("Hello world", [
      { role: "button", name: "Buy" },
    ]);

    expect(snapshot).toEqual({
      origin: "https://shop.example",
      path: "/items",
      snapshot_id: "snap-1",
      title: "Items",
      elements: [{ ref: "e1", role: "button", name: "Buy" }],
      text: "Hello world",
    });
    expect(toolResult("browser_read_page", snapshot, "")).not.toBeNull();
  });

  it("throws rather than return a result the server would refuse", () => {
    expect(() =>
      pageSnapshot({
        location: { origin: "https://shop.example", path: "//items" },
        tabTitle: "Items",
        page: { origin: "https://shop.example", text: "t", elements: [] },
        snapshotId: "snap-1",
      }),
    ).toThrow("does not fit");
  });

  it("cuts an oversized page to every limit, so the server never refuses it for length", () => {
    const elements = Array.from({ length: 400 }, () => ({
      role: "link",
      name: `${"n".repeat(199)}${EMOJI}`,
    }));
    const snapshot = snapshotOf(`${EMOJI}`.repeat(10_000), elements);

    expect(snapshot.text.length).toBeLessThanOrEqual(READ_PAGE_TEXT_MAX);
    expect(snapshot.elements).toHaveLength(READ_PAGE_ELEMENTS_MAX);
    expect(snapshot.elements[149].ref).toBe("e150");
    expect(snapshot.elements[0].name).toBe("n".repeat(199));
    expect(toolResult("browser_read_page", snapshot, "")).not.toBeNull();
  });
});

describe("refIndex", () => {
  it("reads back the position of every ref a snapshot writes", () => {
    const snapshot = pageSnapshot({
      location: { origin: "https://shop.example", path: "/" },
      tabTitle: "Shop",
      page: {
        origin: "https://shop.example",
        text: "",
        elements: Array(READ_PAGE_ELEMENTS_MAX).fill({
          role: "link",
          name: "x",
        }),
      },
      snapshotId: "s1",
    });

    snapshot.elements.forEach((element, index) => {
      expect(refIndex(element.ref)).toBe(index);
    });
  });

  it("refuses anything else", () => {
    for (const ref of [
      "e0",
      "e01",
      "E1",
      "e",
      "1",
      "e1 ",
      "e-1",
      "e99999",
      "x",
    ]) {
      expect(refIndex(ref)).toBeNull();
    }
  });
});
