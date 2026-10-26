import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asArray,
  asRecord,
  asRecords,
  errorMessage,
  isRecord,
  optNumber,
  optString,
} from "./provider-json-b23.ts";

test("isRecord accepts plain objects only", () => {
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord(new Error("x")), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord("text"), false);
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

test("errorMessage reads .message like e?.message", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage({ message: "postgrest" }), "postgrest");
  assert.equal(errorMessage("plain"), undefined);
  assert.equal(errorMessage(null), undefined);
  assert.equal(errorMessage({ code: 1 }), undefined);
});
