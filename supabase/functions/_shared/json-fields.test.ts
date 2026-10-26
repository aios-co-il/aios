import assert from "node:assert/strict";
import test from "node:test";
import {
  asJsonObject,
  jsonArray,
  jsonField,
  thrownMessage,
  toJson,
  unknownField,
} from "./json-fields.ts";

test("jsonField reads object keys and ignores arrays, primitives and null", () => {
  assert.deepEqual(jsonField({ result: { tools: [] } }, "result"), {
    tools: [],
  });
  assert.deepEqual(jsonField({ a: 1 }, "a"), 1);
  assert.equal(jsonField([1, 2], "length"), undefined);
  assert.equal(jsonField("text", "length"), undefined);
  assert.equal(jsonField(null, "a"), undefined);
  assert.equal(jsonField(undefined, "a"), undefined);
  assert.equal(asJsonObject([1]), undefined);
});

test("jsonArray keeps arrays and turns anything else into []", () => {
  assert.deepEqual(jsonArray([1, "a"]), [1, "a"]);
  assert.deepEqual(jsonArray({ 0: "a" }), []);
  assert.deepEqual(jsonArray(undefined), []);
});

test("unknownField and thrownMessage mirror optional property access", () => {
  const err = Object.assign(new Error("boom"), { status: 401 });
  assert.equal(unknownField(err, "status"), 401);
  assert.equal(unknownField("str", "message"), undefined);
  assert.equal(unknownField(null, "message"), undefined);
  assert.equal(thrownMessage(err), "boom");
  assert.equal(thrownMessage("plain"), "plain");
  assert.equal(thrownMessage({ message: "" }), "");
});

test("toJson matches what JSON serialization sends", () => {
  assert.deepEqual(toJson({ a: 1, b: undefined, c: [undefined] }), {
    a: 1,
    c: [null],
  });
});

test("toJson leaves undefined undefined instead of throwing", () => {
  assert.equal(toJson(undefined), undefined);
});
