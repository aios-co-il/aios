import assert from "node:assert/strict";
import { test } from "node:test";
import {
  errorMessage,
  getArray,
  getNumber,
  getObject,
  getPath,
  getString,
  isJsonObject,
  mergeJsonStringParams,
} from "./provider-json-b24.ts";

test("isJsonObject accepts plain objects only", () => {
  assert.equal(isJsonObject({ a: 1 }), true);
  assert.equal(isJsonObject([]), false);
  assert.equal(isJsonObject(null), false);
  assert.equal(isJsonObject("x"), false);
});

test("getPath walks nested objects and stops at other shapes", () => {
  const payload = { a: { b: { c: 3 } }, list: [1] };
  assert.equal(getPath(payload, "a", "b", "c"), 3);
  assert.equal(getPath(payload, "a", "missing", "c"), undefined);
  assert.equal(getPath(payload, "list", "0"), undefined);
  assert.equal(getPath(null, "a"), undefined);
  assert.equal(getPath("text", "length"), undefined);
});

test("typed readers return undefined for the wrong type", () => {
  const payload = { s: "x", n: 2, arr: [1, 2], obj: { k: 1 } };
  assert.equal(getString(payload, "s"), "x");
  assert.equal(getString(payload, "n"), undefined);
  assert.equal(getNumber(payload, "n"), 2);
  assert.equal(getNumber(payload, "s"), undefined);
  assert.deepEqual(getArray(payload, "arr"), [1, 2]);
  assert.deepEqual(getArray(payload, "obj"), []);
  assert.deepEqual(getObject(payload, "obj"), { k: 1 });
  assert.equal(getObject(payload, "arr"), undefined);
});

test("errorMessage reads Error and error-like messages", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage({ message: "pg failed" }), "pg failed");
  assert.equal(errorMessage("plain"), "plain");
});

test("mergeJsonStringParams stringifies values and drops nulls", () => {
  const params: Record<string, string> = { tenant_id: "t1", keep: "k" };
  mergeJsonStringParams(params, {
    tenant_id: null,
    duration: 42,
    status: "ANSWERED",
  });
  assert.deepEqual(params, { keep: "k", duration: "42", status: "ANSWERED" });

  const untouched: Record<string, string> = { a: "1" };
  mergeJsonStringParams(untouched, ["x"]);
  mergeJsonStringParams(untouched, "text");
  assert.deepEqual(untouched, { a: "1" });
});
