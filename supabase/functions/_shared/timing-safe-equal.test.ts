import assert from "node:assert/strict";
import test from "node:test";
import { isServiceKey, timingSafeEqualStr } from "./timing-safe-equal.ts";

test("equal strings match (fallback loop)", () => {
  assert.equal(timingSafeEqualStr("secret-key", "secret-key", undefined), true);
});

test("different strings of the same length do not match", () => {
  assert.equal(
    timingSafeEqualStr("secret-key", "secret-kez", undefined),
    false,
  );
});

test("a length mismatch does not match", () => {
  assert.equal(timingSafeEqualStr("secret", "secret-key", undefined), false);
});

test("uses subtle.timingSafeEqual when present", () => {
  const calls: number[] = [];
  const subtle = {
    timingSafeEqual: (a: Uint8Array, b: Uint8Array) => {
      calls.push(a.length);
      return a.every((v, i) => v === b[i]);
    },
  };
  assert.equal(timingSafeEqualStr("abc", "abc", subtle), true);
  assert.equal(timingSafeEqualStr("abc", "abd", subtle), false);
  assert.deepEqual(calls, [3, 3]);
});

test("falls back when subtle has no timingSafeEqual", () => {
  assert.equal(timingSafeEqualStr("abc", "abc", {}), true);
  assert.equal(timingSafeEqualStr("abc", "abd", {}), false);
});

test("isServiceKey refuses empty tokens and keys", () => {
  assert.equal(isServiceKey("k", "k"), true);
  assert.equal(isServiceKey("", ""), false);
  assert.equal(isServiceKey("", "k"), false);
  assert.equal(isServiceKey("k", ""), false);
  assert.equal(isServiceKey("x", "k"), false);
});
