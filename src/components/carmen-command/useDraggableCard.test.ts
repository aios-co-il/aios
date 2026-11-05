import { expect, test } from "vitest";
import { clampCardPosition } from "./useDraggableCard.ts";

const size = { width: 200, height: 200 };
const view = { width: 1000, height: 800 };

test("keeps a card that is already on screen where it is", () => {
  expect(clampCardPosition({ x: 100, y: 100 }, size, view)).toStrictEqual({
    x: 100,
    y: 100,
  });
});

test("pulls a card dragged past the edges back inside", () => {
  expect(clampCardPosition({ x: -50, y: 900 }, size, view)).toStrictEqual({
    x: 8,
    y: 592,
  });
  expect(clampCardPosition({ x: 990, y: -10 }, size, view)).toStrictEqual({
    x: 792,
    y: 8,
  });
});
