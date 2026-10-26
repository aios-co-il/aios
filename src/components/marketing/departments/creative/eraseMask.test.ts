import { expect, test } from "vitest";
import {
  applyEraseMarks,
  buildErasePrompt,
  createKeepMask,
  maskHasCoverage,
} from "./eraseMask.ts";

test("buildErasePrompt names the marked word and forbids new type", () => {
  const prompt = buildErasePrompt("פרומו");
  expect(prompt).toMatch(/INPAINT \/ ERASE/);
  expect(prompt).toMatch(/פרומו/);
  expect(prompt).toMatch(/Do not add letters/);
  expect(prompt).toMatch(/unmasked pixel/);
  expect(buildErasePrompt("  ")).not.toMatch(/«/);
});

test("empty mask has no coverage; a stroke punches a transparent hole", () => {
  const empty = createKeepMask(32, 32);
  expect(maskHasCoverage(empty)).toBe(false);
  expect(empty[3]).toBe(255);

  applyEraseMarks(empty, 32, 32, [
    { type: "stroke", points: [{ x: 0.5, y: 0.5 }], radius: 0.2 },
  ]);
  expect(maskHasCoverage(empty)).toBe(true);
  const center = (16 * 32 + 16) * 4;
  expect(empty[center + 3]).toBe(0);
  expect(empty[3]).toBe(255);
});

test("a rect mark erases a box and leaves the opposite corner", () => {
  const data = createKeepMask(20, 20);
  applyEraseMarks(data, 20, 20, [
    { type: "rect", x: 0, y: 0, width: 0.4, height: 0.4 },
  ]);
  expect(data[3]).toBe(0);
  const far = (19 * 20 + 19) * 4;
  expect(data[far + 3]).toBe(255);
});
