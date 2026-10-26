import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { isServiceKey, timingSafeEqualStr } from "./timing-safe-equal.ts";

Deno.test("equal strings match (fallback loop)", () => {
  assertStrictEquals(
    timingSafeEqualStr("secret-key", "secret-key", undefined),
    true,
  );
});

Deno.test("different strings of the same length do not match", () => {
  assertStrictEquals(
    timingSafeEqualStr("secret-key", "secret-kez", undefined),
    false,
  );
});

Deno.test("a length mismatch does not match", () => {
  assertStrictEquals(
    timingSafeEqualStr("secret", "secret-key", undefined),
    false,
  );
});

Deno.test("uses subtle.timingSafeEqual when present", () => {
  const calls: number[] = [];
  const subtle = {
    timingSafeEqual: (a: Uint8Array, b: Uint8Array) => {
      calls.push(a.length);
      return a.every((v, i) => v === b[i]);
    },
  };
  assertStrictEquals(timingSafeEqualStr("abc", "abc", subtle), true);
  assertStrictEquals(timingSafeEqualStr("abc", "abd", subtle), false);
  assertEquals(calls, [3, 3]);
});

Deno.test("falls back when subtle has no timingSafeEqual", () => {
  assertStrictEquals(timingSafeEqualStr("abc", "abc", {}), true);
  assertStrictEquals(timingSafeEqualStr("abc", "abd", {}), false);
});

Deno.test("isServiceKey refuses empty tokens and keys", () => {
  assertStrictEquals(isServiceKey("k", "k"), true);
  assertStrictEquals(isServiceKey("", ""), false);
  assertStrictEquals(isServiceKey("", "k"), false);
  assertStrictEquals(isServiceKey("k", ""), false);
  assertStrictEquals(isServiceKey("x", "k"), false);
});
