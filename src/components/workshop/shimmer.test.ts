import { expect, test } from "vitest";
import {
  aspectRatioOf,
  HUE_DEEP_BLUE,
  HUE_MINT,
  shimmerCell,
} from "./shimmer.ts";

test("every cell stays inside the colour and opacity range", () => {
  for (let t = 0; t < 20; t += 0.7)
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 9; col++) {
        const cell = shimmerCell(col, row, 9, 12, t);
        expect(cell.hue >= HUE_MINT && cell.hue <= HUE_DEEP_BLUE).toBeTruthy();
        expect(cell.lightness >= 26 && cell.lightness <= 70).toBeTruthy();
        expect(cell.alpha >= 0.22 && cell.alpha <= 1).toBeTruthy();
      }
});

test("the waves move over time and differ across the field", () => {
  const now = shimmerCell(3, 4, 9, 12, 1);
  expect(now).not.toStrictEqual(shimmerCell(3, 4, 9, 12, 2.5));
  expect(now).not.toStrictEqual(shimmerCell(7, 10, 9, 12, 1));
  expect(now).toStrictEqual(shimmerCell(3, 4, 9, 12, 1));
});

test("a one-cell field does not divide by zero", () => {
  const cell = shimmerCell(0, 0, 1, 1, 0);
  expect(Number.isFinite(cell.hue) && Number.isFinite(cell.alpha)).toBeTruthy();
});

test("formats map to ratios and unknown ones fall back", () => {
  expect(aspectRatioOf("9:16")).toBe(9 / 16);
  expect(aspectRatioOf("auto")).toBe(4 / 5);
  expect(aspectRatioOf("auto", "16:9")).toBe(16 / 9);
});
