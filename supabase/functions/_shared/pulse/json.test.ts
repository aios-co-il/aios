import { assertStrictEquals } from "jsr:@std/assert@1";

import { isJsonObject, sameJson } from "./json.ts";

Deno.test("only a non-array object is a JSON object", () => {
  assertStrictEquals(isJsonObject({ a: 1 }), true);
  assertStrictEquals(isJsonObject([]), false);
  assertStrictEquals(isJsonObject(null), false);
  assertStrictEquals(isJsonObject("x"), false);
});

Deno.test("JSON values match whatever their key order", () => {
  assertStrictEquals(
    sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
    true,
  );
  assertStrictEquals(sameJson({ a: 1 }, { a: 1, b: 2 }), false);
  assertStrictEquals(sameJson([1, 2], [2, 1]), false);
  assertStrictEquals(sameJson({ a: [] }, { a: {} }), false);
});
