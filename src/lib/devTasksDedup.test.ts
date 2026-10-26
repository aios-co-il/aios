import { expect, test } from "vitest";
import { normalizeTitle, titleSimilarity } from "./devTasksDedup.ts";

test("titleSimilarity finds overlapping dev task titles", () => {
  const a = "Fix WooCommerce revenue sync for client 4/4";
  const b = "WooCommerce revenue not syncing for 4/4 client";
  expect(titleSimilarity(a, b) >= 0.4).toBeTruthy();
  expect(titleSimilarity(a, a)).toBe(1);
});

test("normalizeTitle strips punctuation", () => {
  expect(normalizeTitle("  Hello, World!  ")).toBe("hello world");
});
