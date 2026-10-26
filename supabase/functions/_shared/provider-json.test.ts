import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asArray,
  asRecord,
  asRecords,
  errorMessage,
  errorText,
  getArray,
  getNumber,
  getObject,
  getPath,
  getString,
  getText,
  isJsonObject,
  mergeJsonStringParams,
  optNumber,
  optString,
} from "./provider-json.ts";

test("isJsonObject accepts plain objects only", () => {
  assert.equal(isJsonObject({ a: 1 }), true);
  assert.equal(isJsonObject(new Error("x")), true);
  assert.equal(isJsonObject([]), false);
  assert.equal(isJsonObject(null), false);
  assert.equal(isJsonObject("x"), false);
});

test("asRecord / asArray / asRecords fall back to empty values", () => {
  assert.deepEqual(asRecord(null), {});
  assert.deepEqual(asRecord([1]), {});
  assert.deepEqual(asArray({ length: 1 }), []);
  assert.deepEqual(asRecords([{ id: "1" }, null, "x", [2], { id: "2" }]), [
    { id: "1" },
    { id: "2" },
  ]);
});

test("optString / optNumber keep only the matching primitive", () => {
  assert.equal(optString("a"), "a");
  assert.equal(optString(1), undefined);
  assert.equal(optNumber(2), 2);
  assert.equal(optNumber("2"), undefined);
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

test("getText accepts strings and finite numbers", () => {
  const payload = { s: "0501", n: 972501, nan: Number.NaN, b: true };
  assert.equal(getText(payload, "s"), "0501");
  assert.equal(getText(payload, "n"), "972501");
  assert.equal(getText(payload, "nan"), undefined);
  assert.equal(getText(payload, "b"), undefined);
});

test("errorMessage reads .message like e?.message", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage({ message: "postgrest" }), "postgrest");
  assert.equal(errorMessage("plain"), undefined);
  assert.equal(errorMessage(null), undefined);
  assert.equal(errorMessage({ code: 1 }), undefined);
});

test("errorText falls back to the stringified value", () => {
  assert.equal(errorText(new Error("boom")), "boom");
  assert.equal(errorText({ message: "pg failed" }), "pg failed");
  assert.equal(errorText("plain"), "plain");
  assert.equal(errorText(null), "null");
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
