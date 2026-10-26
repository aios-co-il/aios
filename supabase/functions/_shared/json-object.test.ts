import assert from "node:assert/strict";
import { test } from "node:test";
import { objectOrEmpty } from "../carmen-memory-backfill/legacy-rows.ts";
import { errorMessage } from "./error-message.ts";
import { jsonObject, jsonText } from "./json-object.ts";

test("jsonObject returns objects and throws on null like property access", () => {
  const value = { id: "a", n: 1 };
  assert.equal(jsonObject(value), value);
  assert.deepEqual(jsonObject("text"), {});
  assert.deepEqual(jsonObject([1, 2]), {});
  assert.deepEqual(jsonObject(3), {});
  assert.throws(() => jsonObject(null), TypeError);
  assert.throws(() => jsonObject(undefined), TypeError);
});

test("jsonText mirrors the text PostgREST stores for JSON values", () => {
  assert.equal(jsonText("abc"), "abc");
  assert.equal(jsonText(""), "");
  assert.equal(jsonText(5), "5");
  assert.equal(jsonText(false), "false");
  assert.equal(jsonText({ a: 1 }), '{"a":1}');
  assert.equal(jsonText(null), null);
  assert.equal(jsonText(undefined), null);
});

test("errorMessage reads message from errors and error-like objects", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage({ message: "postgrest" }), "postgrest");
  assert.equal(errorMessage({ message: 42 }), "42");
  assert.equal(errorMessage("plain string"), undefined);
  assert.equal(errorMessage(null), undefined);
});

test("objectOrEmpty keeps objects and maps other values to an empty object", () => {
  const row = { id: "x" };
  assert.equal(objectOrEmpty(row), row);
  assert.deepEqual(objectOrEmpty(null), {});
  assert.deepEqual(objectOrEmpty("s"), {});
});
