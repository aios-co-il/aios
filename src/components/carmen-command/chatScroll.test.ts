import assert from "node:assert/strict";
import test from "node:test";
import { answerScrollTarget } from "./chatScroll.ts";

const base = { scrollHeight: 2000, clientHeight: 500 };

test("short answer: scrolls to the bottom", () => {
  assert.equal(
    answerScrollTarget({ ...base, scrollTop: 1000, answerTop: 1700 }),
    1500,
  );
});

test("long answer: pins its first line instead of the end", () => {
  assert.equal(
    answerScrollTarget({ ...base, scrollTop: 900, answerTop: 1012 }),
    1000,
  );
});

test("never scrolls back up past where the reader is", () => {
  assert.equal(
    answerScrollTarget({ ...base, scrollTop: 1200, answerTop: 1012 }),
    null,
  );
});

test("no answer row: falls back to bottom", () => {
  assert.equal(
    answerScrollTarget({ ...base, scrollTop: 0, answerTop: null }),
    1500,
  );
});
