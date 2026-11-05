import { expect, test } from "vitest";
import { answerScrollTarget } from "./chatScroll.ts";

const base = { scrollHeight: 2000, clientHeight: 500 };

test("short answer: scrolls to the bottom", () => {
  expect(
    answerScrollTarget({ ...base, scrollTop: 1000, answerTop: 1700 }),
  ).toBe(1500);
});

test("long answer: pins its first line instead of the end", () => {
  expect(answerScrollTarget({ ...base, scrollTop: 900, answerTop: 1012 })).toBe(
    1000,
  );
});

test("never scrolls back up past where the reader is", () => {
  expect(
    answerScrollTarget({ ...base, scrollTop: 1200, answerTop: 1012 }),
  ).toBe(null);
});

test("no answer row: falls back to bottom", () => {
  expect(answerScrollTarget({ ...base, scrollTop: 0, answerTop: null })).toBe(
    1500,
  );
});
