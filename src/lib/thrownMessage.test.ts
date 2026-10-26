import assert from "node:assert/strict";
import test from "node:test";
import { thrownMessage } from "./thrownMessage.ts";

test("thrownMessage reads the message of an Error", () => {
  assert.equal(thrownMessage(new Error("boom")), "boom");
});

test("thrownMessage reads the message of an error-like object", () => {
  assert.equal(
    thrownMessage({ message: "row not found", code: "PGRST116" }),
    "row not found",
  );
});

test("thrownMessage returns undefined without a string message", () => {
  assert.equal(thrownMessage("oops"), undefined);
  assert.equal(thrownMessage(null), undefined);
  assert.equal(thrownMessage({ message: 42 }), undefined);
});
