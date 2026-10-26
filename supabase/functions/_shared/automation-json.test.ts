import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asList,
  asText,
  jsonObject,
  messageOf,
  nullableText,
  objectList,
  optString,
  prop,
  statusFields,
  toJson,
} from "./automation-json.ts";

test("jsonObject keeps the same object and drops non-objects", () => {
  const config = { message_template: "hi" };
  assert.equal(jsonObject(config), config);
  assert.deepEqual(jsonObject(null), {});
  assert.deepEqual(jsonObject("x"), {});
  assert.deepEqual(jsonObject([1]), {});
});

test("list helpers keep arrays and plain-object items only", () => {
  assert.deepEqual(asList("a,b"), []);
  assert.deepEqual(objectList([{ id: 1 }, null, "x", [2]]), [{ id: 1 }]);
});

test("prop reads like optional chaining on JSON values", () => {
  assert.equal(prop({ output: "ok" }, "output"), "ok");
  assert.equal(prop("text", "output"), undefined);
  assert.equal(prop(null, "output"), undefined);
  assert.equal(prop(new Error("boom"), "message"), "boom");
});

test("text helpers", () => {
  assert.equal(asText("a"), "a");
  assert.equal(asText(5), "5");
  assert.equal(asText({}), "");
  assert.equal(optString(5), null);
  assert.equal(nullableText(undefined), null);
  assert.equal(nullableText(972), "972");
  assert.deepEqual(statusFields({ status: "won", status_kind: 3 }), {
    status: "won",
    new_status: null,
    status_kind: null,
  });
});

test("messageOf reads message from errors and error-like objects", () => {
  assert.equal(messageOf(new Error("boom")), "boom");
  assert.equal(messageOf({ message: "pg error", code: "23505" }), "pg error");
  assert.equal(messageOf("plain"), undefined);
  assert.equal(messageOf({ message: "" }), undefined);
});

test("toJson matches what JSON.stringify sends", () => {
  assert.deepEqual(toJson({ a: 1, b: undefined, c: [undefined] }), {
    a: 1,
    c: [null],
  });
  assert.equal(toJson(undefined), undefined);
  assert.equal(
    JSON.stringify({ payload: toJson({ d: new Date(0) }) }),
    JSON.stringify({ payload: { d: new Date(0) } }),
  );
});
