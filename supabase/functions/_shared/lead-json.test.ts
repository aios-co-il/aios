import assert from "node:assert/strict";
import test from "node:test";
import { asJsonObject, asObject, thrownMessage } from "./lead-json.ts";

test("asObject keeps plain objects and drops scalars, arrays and null", () => {
  const value = { a: 1 };
  assert.equal(asObject(value), value);
  assert.equal(asObject([1]), null);
  assert.equal(asObject("x"), null);
  assert.equal(asObject(null), null);
  assert.equal(asObject(undefined), null);
});

test("asJsonObject only returns JSON objects", () => {
  assert.deepEqual(asJsonObject({ page_id: "1" }), { page_id: "1" });
  assert.equal(asJsonObject(["a"]), null);
  assert.equal(asJsonObject(3), null);
  assert.equal(asJsonObject(null), null);
});

test("thrownMessage reads message from errors and error-like objects", () => {
  assert.equal(thrownMessage(new Error("boom")), "boom");
  assert.equal(
    thrownMessage({ message: "pg failed", code: "23505" }),
    "pg failed",
  );
  assert.equal(thrownMessage("plain string"), undefined);
  assert.equal(thrownMessage(null), undefined);
});
