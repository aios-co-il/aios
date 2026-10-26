import assert from "node:assert/strict";
import test from "node:test";
import {
  asJsonObject,
  firstTruthyText,
  isJsonObject,
  jsonField,
  jsonText,
  jsonToDate,
  thrownMessage,
} from "./crm-json.ts";

test("isJsonObject accepts only plain objects", () => {
  assert.equal(isJsonObject({ a: 1 }), true);
  assert.equal(isJsonObject([1]), false);
  assert.equal(isJsonObject(null), false);
  assert.equal(isJsonObject("x"), false);
  assert.equal(isJsonObject(undefined), false);
});

test("asJsonObject falls back to an empty object", () => {
  const value = { clientId: "c1" };
  assert.equal(asJsonObject(value), value);
  assert.deepEqual(asJsonObject(["a"]), {});
  assert.deepEqual(asJsonObject(null), {});
  assert.deepEqual(asJsonObject("text"), {});
});

test("jsonField reads object fields like optional chaining", () => {
  assert.equal(jsonField({ date: "2026-01-02" }, "date"), "2026-01-02");
  assert.equal(jsonField({ clicks: 0 }, "clicks"), 0);
  assert.equal(jsonField(["2026-01-02"], "date"), undefined);
  assert.equal(jsonField(null, "date"), undefined);
  assert.equal(jsonField(undefined, "date"), undefined);
});

test("jsonText returns only non-empty strings", () => {
  assert.equal(jsonText({ id: "t1" }, "id"), "t1");
  assert.equal(jsonText({ id: "" }, "id"), undefined);
  assert.equal(jsonText({ id: 5 }, "id"), undefined);
});

test("firstTruthyText mirrors an `a || b || null` chain as text", () => {
  assert.equal(firstTruthyText(undefined, "", "site"), "site");
  assert.equal(firstTruthyText(null, 0, false), null);
  assert.equal(firstTruthyText(42), "42");
  assert.equal(firstTruthyText(), null);
});

test("jsonToDate matches new Date(value) for JSON inputs", () => {
  const iso = "2026-03-04T05:06:07.000Z";
  assert.equal(jsonToDate(iso).getTime(), new Date(iso).getTime());
  assert.equal(jsonToDate(1_700_000_000_000).getTime(), 1_700_000_000_000);
  assert.equal(jsonToDate(null).getTime(), 0);
  assert.equal(jsonToDate(true).getTime(), 1);
  assert.equal(Number.isNaN(jsonToDate({}).getTime()), true);
});

test("thrownMessage reads message from Error and PostgREST-style objects", () => {
  assert.equal(thrownMessage(new Error("boom")), "boom");
  assert.equal(
    thrownMessage({ message: "row missing", code: "PGRST116" }),
    "row missing",
  );
  assert.equal(thrownMessage("plain"), undefined);
  assert.equal(thrownMessage(null), undefined);
});
