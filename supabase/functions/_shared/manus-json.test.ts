import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  parseJsonOrRaw,
  thrownMessage,
  thrownName,
} from "./manus-json.ts";

Deno.test("asJsonObject keeps objects and rejects other JSON values", () => {
  const obj = { instance_id: "i1" };
  assertStrictEquals(asJsonObject(obj), obj);
  assertStrictEquals(asJsonObject(null), null);
  assertStrictEquals(asJsonObject(undefined), null);
  assertStrictEquals(asJsonObject([1]), null);
  assertStrictEquals(asJsonObject("x"), null);
  assertStrictEquals(asJsonObject(3), null);
});

Deno.test("parseJsonOrRaw parses JSON and wraps invalid text", () => {
  assertEquals(parseJsonOrRaw('{"success":true}'), { success: true });
  assertStrictEquals(parseJsonOrRaw("null"), null);
  assertEquals(parseJsonOrRaw("<html>"), { raw: "<html>" });
});

Deno.test("thrownMessage and thrownName read error-like values only", () => {
  const err = new Error("boom");
  assertStrictEquals(thrownMessage(err), "boom");
  assertStrictEquals(thrownName(err), "Error");
  assertStrictEquals(thrownMessage({ message: "pg" }), "pg");
  assertStrictEquals(thrownMessage("text"), undefined);
  assertStrictEquals(thrownMessage(null), undefined);
  assertStrictEquals(thrownName(undefined), undefined);
});
