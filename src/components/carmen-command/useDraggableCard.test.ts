import assert from "node:assert/strict";
import test from "node:test";
import { clampCardPosition } from "./useDraggableCard.ts";

const size = { width: 200, height: 200 };
const view = { width: 1000, height: 800 };

test("keeps a card that is already on screen where it is", () => {
  assert.deepEqual(clampCardPosition({ x: 100, y: 100 }, size, view), {
    x: 100,
    y: 100,
  });
});

test("pulls a card dragged past the edges back inside", () => {
  assert.deepEqual(clampCardPosition({ x: -50, y: 900 }, size, view), {
    x: 8,
    y: 592,
  });
  assert.deepEqual(clampCardPosition({ x: 990, y: -10 }, size, view), {
    x: 792,
    y: 8,
  });
});
