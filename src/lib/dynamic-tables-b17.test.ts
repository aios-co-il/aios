import assert from "node:assert/strict";
import test from "node:test";
import {
  asJsonArray,
  asJsonObject,
  errorMessage,
  jsonObjects,
  readDateInput,
  readFloat,
  readString,
  readText,
  toLangFilter,
} from "./dynamic-tables-b17.ts";

test("asJsonObject keeps plain objects and replaces everything else", () => {
  const settings = { clientId: "c1" };
  assert.equal(asJsonObject(settings), settings);
  assert.deepEqual(asJsonObject(null), {});
  assert.deepEqual(asJsonObject([1, 2]), {});
  assert.deepEqual(asJsonObject("x"), {});
});

test("asJsonArray and jsonObjects only accept arrays", () => {
  const list = [{ id: "a" }, "b", null];
  assert.equal(asJsonArray(list), list);
  assert.deepEqual(asJsonArray({ 0: "a" }), []);
  assert.deepEqual(jsonObjects(list), [{ id: "a" }]);
  assert.deepEqual(jsonObjects(undefined), []);
});

test("field readers narrow by runtime type", () => {
  const data = { name: "Acme", count: 7, flag: true, spend: "12.5" };
  assert.equal(readString(data, "name"), "Acme");
  assert.equal(readString(data, "count"), undefined);
  assert.equal(readText(data, "count"), "7");
  assert.equal(readText(data, "flag"), undefined);
  assert.equal(readDateInput(data, "count"), 7);
  assert.equal(readString(["Acme"], "0"), undefined);
});

test("readFloat matches parseFloat on the raw value", () => {
  assert.equal(readFloat({ spend: "12.5" }, "spend"), 12.5);
  assert.equal(readFloat({ spend: 3 }, "spend"), 3);
  assert.ok(Number.isNaN(readFloat({}, "spend")));
  assert.ok(Number.isNaN(readFloat(undefined, "spend")));
});

test("errorMessage reads message from Error and error-like objects", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(
    errorMessage({ message: "pg failed", code: "42501" }),
    "pg failed",
  );
  assert.equal(errorMessage("plain"), undefined);
  assert.equal(errorMessage(null), undefined);
  assert.equal(errorMessage({ message: 42 }), undefined);
});

test("toLangFilter falls back to all for unknown values", () => {
  assert.equal(toLangFilter("he"), "he");
  assert.equal(toLangFilter("en"), "en");
  assert.equal(toLangFilter("fr"), "all");
  assert.equal(toLangFilter(undefined), "all");
});
