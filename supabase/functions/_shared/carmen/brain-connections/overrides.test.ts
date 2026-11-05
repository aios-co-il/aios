import { assertStrictEquals } from "jsr:@std/assert@1";
import { settingString } from "./overrides.ts";

Deno.test("settingString reads only string fields of an object", () => {
  assertStrictEquals(settingString({ a: " x " }, "a"), "x");
  assertStrictEquals(settingString({ a: 1 }, "a"), "");
  assertStrictEquals(settingString(null, "a"), "");
  assertStrictEquals(settingString(["x"], "0"), "");
});
