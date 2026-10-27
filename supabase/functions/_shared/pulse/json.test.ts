import { assertStrictEquals } from "jsr:@std/assert@1";

import { isJsonObject } from "./json.ts";

Deno.test("only a non-array object is a JSON object", () => {
  assertStrictEquals(isJsonObject({ a: 1 }), true);
  assertStrictEquals(isJsonObject([]), false);
  assertStrictEquals(isJsonObject(null), false);
  assertStrictEquals(isJsonObject("x"), false);
});
