import assert from "node:assert/strict";
import { test } from "node:test";
import { aspectRatioOf, shimmerCell } from "./shimmer.ts";

test("every cell stays inside the colour and opacity range", () => {
  for (let t = 0; t < 20; t += 0.7)
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 9; col++) {
        const cell = shimmerCell(col, row, 9, 12, t);
        assert.ok(cell.hue >= 0 && cell.hue < 360);
        assert.ok(cell.lightness >= 26 && cell.lightness <= 70);
        assert.ok(cell.alpha >= 0.22 && cell.alpha <= 1);
      }
});

test("the waves move over time and differ across the field", () => {
  const now = shimmerCell(3, 4, 9, 12, 1);
  assert.notDeepEqual(now, shimmerCell(3, 4, 9, 12, 2.5));
  assert.notDeepEqual(now, shimmerCell(7, 10, 9, 12, 1));
  assert.deepEqual(now, shimmerCell(3, 4, 9, 12, 1));
});

test("a one-cell field does not divide by zero", () => {
  const cell = shimmerCell(0, 0, 1, 1, 0);
  assert.ok(Number.isFinite(cell.hue) && Number.isFinite(cell.alpha));
});

test("formats map to ratios and unknown ones fall back", () => {
  assert.equal(aspectRatioOf("9:16"), 9 / 16);
  assert.equal(aspectRatioOf("auto"), 4 / 5);
  assert.equal(aspectRatioOf("auto", "16:9"), 16 / 9);
});
