import assert from "node:assert/strict";
import test from "node:test";
import {
  isJsonObject,
  isPresent,
  jsonField,
  readErrorMessage,
} from "./pageTypeGuards.ts";
import {
  documentFieldsToJson,
  signaturePositionToJson,
} from "./signatureFieldsJson.ts";

test("isJsonObject accepts plain objects only", () => {
  assert.equal(isJsonObject({ a: 1 }), true);
  assert.equal(isJsonObject([]), false);
  assert.equal(isJsonObject(null), false);
  assert.equal(isJsonObject("x"), false);
});

test("jsonField reads a key from objects and ignores other shapes", () => {
  assert.equal(jsonField({ instance_id: "123" }, "instance_id"), "123");
  assert.equal(jsonField(["123"], "0"), undefined);
  assert.equal(jsonField(null, "instance_id"), undefined);
});

test("isPresent drops null and undefined", () => {
  const values = [{ id: "a" }, null, undefined, { id: "b" }];
  assert.deepEqual(values.filter(isPresent), [{ id: "a" }, { id: "b" }]);
});

test("readErrorMessage reads message from Error and error-like objects", () => {
  assert.equal(readErrorMessage(new Error("boom")), "boom");
  assert.equal(
    readErrorMessage({ message: "pg failed", code: "23505" }),
    "pg failed",
  );
  assert.equal(readErrorMessage({ message: 42 }), undefined);
  assert.equal(readErrorMessage("plain string"), undefined);
  assert.equal(readErrorMessage(null), undefined);
});

test("signature serializers keep every field value", () => {
  const position = { x: 1, y: 2, width: 3, height: 4, page: 1 };
  assert.deepEqual(signaturePositionToJson(position), position);
  const field = {
    id: "f1",
    type: "signature" as const,
    label: "Sign",
    position,
    recipient_index: 0,
  };
  const json = documentFieldsToJson([field]);
  assert.deepEqual(json, [field]);
  assert.equal(JSON.stringify(json), JSON.stringify([field]));
});
