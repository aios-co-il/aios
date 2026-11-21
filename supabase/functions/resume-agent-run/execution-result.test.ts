import { assertStrictEquals } from "jsr:@std/assert@1";
import { reportsFailure } from "./execution-result.ts";

Deno.test("reportsFailure is true only for ok: false", () => {
  assertStrictEquals(reportsFailure({ ok: false, error: "x" }), true);
  assertStrictEquals(reportsFailure({ ok: true }), false);
  assertStrictEquals(reportsFailure({ ok: 0 }), false);
  assertStrictEquals(reportsFailure({}), false);
  assertStrictEquals(reportsFailure(null), false);
  assertStrictEquals(reportsFailure("ok"), false);
  assertStrictEquals(reportsFailure([false]), false);
});
