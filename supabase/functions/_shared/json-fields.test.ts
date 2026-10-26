import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  jsonArray,
  jsonField,
  thrownMessage,
  toJson,
  unknownField,
} from "./json-fields.ts";

Deno.test(
  "jsonField reads object keys and ignores arrays, primitives and null",
  () => {
    assertEquals(jsonField({ result: { tools: [] } }, "result"), {
      tools: [],
    });
    assertEquals(jsonField({ a: 1 }, "a"), 1);
    assertStrictEquals(jsonField([1, 2], "length"), undefined);
    assertStrictEquals(jsonField("text", "length"), undefined);
    assertStrictEquals(jsonField(null, "a"), undefined);
    assertStrictEquals(jsonField(undefined, "a"), undefined);
    assertStrictEquals(asJsonObject([1]), undefined);
  },
);

Deno.test("jsonArray keeps arrays and turns anything else into []", () => {
  assertEquals(jsonArray([1, "a"]), [1, "a"]);
  assertEquals(jsonArray({ 0: "a" }), []);
  assertEquals(jsonArray(undefined), []);
});

Deno.test(
  "unknownField and thrownMessage mirror optional property access",
  () => {
    const err = Object.assign(new Error("boom"), { status: 401 });
    assertStrictEquals(unknownField(err, "status"), 401);
    assertStrictEquals(unknownField("str", "message"), undefined);
    assertStrictEquals(unknownField(null, "message"), undefined);
    assertStrictEquals(thrownMessage(err), "boom");
    assertStrictEquals(thrownMessage("plain"), "plain");
    assertStrictEquals(thrownMessage({ message: "" }), "");
  },
);

Deno.test("toJson matches what JSON serialization sends", () => {
  assertEquals(toJson({ a: 1, b: undefined, c: [undefined] }), {
    a: 1,
    c: [null],
  });
});

Deno.test("toJson leaves undefined undefined instead of throwing", () => {
  assertStrictEquals(toJson(undefined), undefined);
});
