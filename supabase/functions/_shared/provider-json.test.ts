import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
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

Deno.test("isJsonObject accepts plain objects only", () => {
  assertStrictEquals(isJsonObject({ a: 1 }), true);
  assertStrictEquals(isJsonObject(new Error("x")), true);
  assertStrictEquals(isJsonObject([]), false);
  assertStrictEquals(isJsonObject(null), false);
  assertStrictEquals(isJsonObject("x"), false);
});

Deno.test("asRecord / asArray / asRecords fall back to empty values", () => {
  assertEquals(asRecord(null), {});
  assertEquals(asRecord([1]), {});
  assertEquals(asArray({ length: 1 }), []);
  assertEquals(asRecords([{ id: "1" }, null, "x", [2], { id: "2" }]), [
    { id: "1" },
    { id: "2" },
  ]);
});

Deno.test("optString / optNumber keep only the matching primitive", () => {
  assertStrictEquals(optString("a"), "a");
  assertStrictEquals(optString(1), undefined);
  assertStrictEquals(optNumber(2), 2);
  assertStrictEquals(optNumber("2"), undefined);
});

Deno.test("getPath walks nested objects and stops at other shapes", () => {
  const payload = { a: { b: { c: 3 } }, list: [1] };
  assertStrictEquals(getPath(payload, "a", "b", "c"), 3);
  assertStrictEquals(getPath(payload, "a", "missing", "c"), undefined);
  assertStrictEquals(getPath(payload, "list", "0"), undefined);
  assertStrictEquals(getPath(null, "a"), undefined);
  assertStrictEquals(getPath("text", "length"), undefined);
});

Deno.test("typed readers return undefined for the wrong type", () => {
  const payload = { s: "x", n: 2, arr: [1, 2], obj: { k: 1 } };
  assertStrictEquals(getString(payload, "s"), "x");
  assertStrictEquals(getString(payload, "n"), undefined);
  assertStrictEquals(getNumber(payload, "n"), 2);
  assertStrictEquals(getNumber(payload, "s"), undefined);
  assertEquals(getArray(payload, "arr"), [1, 2]);
  assertEquals(getArray(payload, "obj"), []);
  assertEquals(getObject(payload, "obj"), { k: 1 });
  assertStrictEquals(getObject(payload, "arr"), undefined);
});

Deno.test("getText accepts strings and finite numbers", () => {
  const payload = { s: "0501", n: 972501, nan: Number.NaN, b: true };
  assertStrictEquals(getText(payload, "s"), "0501");
  assertStrictEquals(getText(payload, "n"), "972501");
  assertStrictEquals(getText(payload, "nan"), undefined);
  assertStrictEquals(getText(payload, "b"), undefined);
});

Deno.test("errorMessage reads .message like e?.message", () => {
  assertStrictEquals(errorMessage(new Error("boom")), "boom");
  assertStrictEquals(errorMessage({ message: "postgrest" }), "postgrest");
  assertStrictEquals(errorMessage("plain"), undefined);
  assertStrictEquals(errorMessage(null), undefined);
  assertStrictEquals(errorMessage({ code: 1 }), undefined);
});

Deno.test("errorText falls back to the stringified value", () => {
  assertStrictEquals(errorText(new Error("boom")), "boom");
  assertStrictEquals(errorText({ message: "pg failed" }), "pg failed");
  assertStrictEquals(errorText("plain"), "plain");
  assertStrictEquals(errorText(null), "null");
});

Deno.test("mergeJsonStringParams stringifies values and drops nulls", () => {
  const params: Record<string, string> = { tenant_id: "t1", keep: "k" };
  mergeJsonStringParams(params, {
    tenant_id: null,
    duration: 42,
    status: "ANSWERED",
  });
  assertEquals(params, { keep: "k", duration: "42", status: "ANSWERED" });

  const untouched: Record<string, string> = { a: "1" };
  mergeJsonStringParams(untouched, ["x"]);
  mergeJsonStringParams(untouched, "text");
  assertEquals(untouched, { a: "1" });
});
