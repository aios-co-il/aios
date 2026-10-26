import assert from "node:assert/strict";
import test from "node:test";
import {
  asRecord,
  errorMessageOr,
  isRecord,
  parseJsonRecord,
} from "./unknown-record.ts";

test("isRecord accepts objects and rejects null and primitives", () => {
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord([]), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord("x"), false);
  assert.equal(isRecord(3), false);
});

test("asRecord falls back to an empty record", () => {
  const value = { id: "a" };
  assert.equal(asRecord(value), value);
  assert.deepEqual(asRecord(undefined), {});
  assert.deepEqual(asRecord("text"), {});
});

test("parseJsonRecord reads objects and tolerates bad or non-object JSON", () => {
  assert.deepEqual(parseJsonRecord('{"url":"https://x"}'), { url: "https://x" });
  assert.deepEqual(parseJsonRecord("not json"), {});
  assert.deepEqual(parseJsonRecord("null"), {});
  assert.deepEqual(parseJsonRecord("42"), {});
});

test("errorMessageOr mirrors e?.message ?? e", () => {
  assert.equal(errorMessageOr(new Error("boom")), "boom");
  assert.equal(errorMessageOr({ message: "pg failed", code: "23505" }), "pg failed");
  const noMessage = { code: "x" };
  assert.equal(errorMessageOr(noMessage), noMessage);
  assert.equal(errorMessageOr("plain"), "plain");
  assert.equal(errorMessageOr(null), null);
});
