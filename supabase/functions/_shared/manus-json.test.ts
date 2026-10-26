import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asJsonObject,
  parseJsonOrRaw,
  thrownMessage,
  thrownName,
} from "./manus-json.ts";

test("asJsonObject keeps objects and rejects other JSON values", () => {
  const obj = { instance_id: "i1" };
  assert.equal(asJsonObject(obj), obj);
  assert.equal(asJsonObject(null), null);
  assert.equal(asJsonObject(undefined), null);
  assert.equal(asJsonObject([1]), null);
  assert.equal(asJsonObject("x"), null);
  assert.equal(asJsonObject(3), null);
});

test("parseJsonOrRaw parses JSON and wraps invalid text", () => {
  assert.deepEqual(parseJsonOrRaw('{"success":true}'), { success: true });
  assert.equal(parseJsonOrRaw("null"), null);
  assert.deepEqual(parseJsonOrRaw("<html>"), { raw: "<html>" });
});

test("thrownMessage and thrownName read error-like values only", () => {
  const err = new Error("boom");
  assert.equal(thrownMessage(err), "boom");
  assert.equal(thrownName(err), "Error");
  assert.equal(thrownMessage({ message: "pg" }), "pg");
  assert.equal(thrownMessage("text"), undefined);
  assert.equal(thrownMessage(null), undefined);
  assert.equal(thrownName(undefined), undefined);
});
