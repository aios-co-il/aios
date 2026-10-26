import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asJsonArray,
  asJsonObject,
  isOneOf,
  jsonPrimitive,
  jsonString,
  thrownMessage,
} from "./agentUiHelpers.ts";

describe("agentUiHelpers", () => {
  it("asJsonObject accepts plain objects only", () => {
    assert.deepEqual(asJsonObject({ a: 1 }), { a: 1 });
    assert.equal(asJsonObject([1]), null);
    assert.equal(asJsonObject("x"), null);
    assert.equal(asJsonObject(null), null);
    assert.equal(asJsonObject(undefined), null);
  });

  it("asJsonArray returns arrays and [] otherwise", () => {
    assert.deepEqual(asJsonArray([1, "a"]), [1, "a"]);
    assert.deepEqual(asJsonArray({ length: 2 }), []);
    assert.deepEqual(asJsonArray("abc"), []);
    assert.deepEqual(asJsonArray(null), []);
  });

  it("jsonString reads string fields only", () => {
    assert.equal(jsonString({ repo: "a/b" }, "repo"), "a/b");
    assert.equal(jsonString({ repo: 5 }, "repo"), undefined);
    assert.equal(jsonString(["repo"], "repo"), undefined);
    assert.equal(jsonString(null, "repo"), undefined);
  });

  it("jsonPrimitive drops nested objects and arrays", () => {
    assert.equal(jsonPrimitive("t"), "t");
    assert.equal(jsonPrimitive(3), 3);
    assert.equal(jsonPrimitive(null), null);
    assert.equal(jsonPrimitive({ a: 1 }), undefined);
    assert.equal(jsonPrimitive([1]), undefined);
  });

  it("isOneOf narrows to the listed values", () => {
    const kinds = ["edge", "mcp"] as const;
    assert.equal(isOneOf(kinds, "edge"), true);
    assert.equal(isOneOf(kinds, "other"), false);
  });

  it("thrownMessage reads message from error-like values", () => {
    assert.equal(thrownMessage(new Error("boom")), "boom");
    assert.equal(
      thrownMessage({ message: "pg error", code: "42" }),
      "pg error",
    );
    assert.equal(thrownMessage("plain"), undefined);
    assert.equal(thrownMessage(null), undefined);
  });
});
