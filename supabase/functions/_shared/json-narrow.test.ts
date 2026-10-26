import assert from "node:assert/strict";
import test from "node:test";
import { isRecord, jsonObject, thrownMessage } from "./json-narrow.ts";

test("jsonObject keeps plain objects and drops other JSON values", () => {
  const obj = { a: 1, nested: { b: [1, 2] } };
  assert.equal(jsonObject(obj), obj);
  for (const value of [null, undefined, "text", 3, true, [1, 2]]) {
    assert.deepEqual(jsonObject(value), {});
  }
});

test("thrownMessage mirrors optional message reads", () => {
  assert.equal(thrownMessage(new Error("boom")), "boom");
  assert.equal(thrownMessage({ message: "postgrest" }), "postgrest");
  assert.equal(thrownMessage({ message: 0 }), 0);
  assert.equal(thrownMessage({ code: 1 }), undefined);
  assert.equal(thrownMessage("plain"), undefined);
  assert.equal(thrownMessage(null), undefined);
  assert.equal(thrownMessage(undefined), undefined);
});

test("isRecord accepts plain objects only", () => {
  assert.equal(isRecord({ a: 1 }), true);
  for (const value of [null, undefined, "x", 1, [1]]) {
    assert.equal(isRecord(value), false);
  }
});
