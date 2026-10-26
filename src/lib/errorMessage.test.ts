import assert from "node:assert/strict";
import test from "node:test";
import { errorMessageOf } from "./errorMessage.ts";

test("errorMessageOf reads the message of an Error", () => {
  assert.equal(errorMessageOf(new Error("boom")), "boom");
});

test("errorMessageOf reads the message of an error-like object", () => {
  assert.equal(
    errorMessageOf({ message: "row not found", code: "PGRST116" }),
    "row not found",
  );
});

test("errorMessageOf returns undefined without a string message", () => {
  assert.equal(errorMessageOf("oops"), undefined);
  assert.equal(errorMessageOf(null), undefined);
  assert.equal(errorMessageOf({ message: 42 }), undefined);
  assert.equal(errorMessageOf({}), undefined);
});
