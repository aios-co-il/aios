import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  firstTruthyText,
  isJsonObject,
  jsonField,
  jsonText,
  jsonToDate,
  thrownMessage,
} from "./crm-json.ts";

Deno.test("isJsonObject accepts only plain objects", () => {
  assertStrictEquals(isJsonObject({ a: 1 }), true);
  assertStrictEquals(isJsonObject([1]), false);
  assertStrictEquals(isJsonObject(null), false);
  assertStrictEquals(isJsonObject("x"), false);
  assertStrictEquals(isJsonObject(undefined), false);
});

Deno.test("asJsonObject falls back to an empty object", () => {
  const value = { clientId: "c1" };
  assertStrictEquals(asJsonObject(value), value);
  assertEquals(asJsonObject(["a"]), {});
  assertEquals(asJsonObject(null), {});
  assertEquals(asJsonObject("text"), {});
});

Deno.test("jsonField reads object fields like optional chaining", () => {
  assertStrictEquals(jsonField({ date: "2026-01-02" }, "date"), "2026-01-02");
  assertStrictEquals(jsonField({ clicks: 0 }, "clicks"), 0);
  assertStrictEquals(jsonField(["2026-01-02"], "date"), undefined);
  assertStrictEquals(jsonField(null, "date"), undefined);
  assertStrictEquals(jsonField(undefined, "date"), undefined);
});

Deno.test("jsonText returns only non-empty strings", () => {
  assertStrictEquals(jsonText({ id: "t1" }, "id"), "t1");
  assertStrictEquals(jsonText({ id: "" }, "id"), undefined);
  assertStrictEquals(jsonText({ id: 5 }, "id"), undefined);
});

Deno.test("firstTruthyText mirrors an `a || b || null` chain as text", () => {
  assertStrictEquals(firstTruthyText(undefined, "", "site"), "site");
  assertStrictEquals(firstTruthyText(null, 0, false), null);
  assertStrictEquals(firstTruthyText(42), "42");
  assertStrictEquals(firstTruthyText(), null);
});

Deno.test("jsonToDate matches new Date(value) for JSON inputs", () => {
  const iso = "2026-03-04T05:06:07.000Z";
  assertStrictEquals(jsonToDate(iso).getTime(), new Date(iso).getTime());
  assertStrictEquals(
    jsonToDate(1_700_000_000_000).getTime(),
    1_700_000_000_000,
  );
  assertStrictEquals(jsonToDate(null).getTime(), 0);
  assertStrictEquals(jsonToDate(true).getTime(), 1);
  assertStrictEquals(Number.isNaN(jsonToDate({}).getTime()), true);
});

Deno.test(
  "thrownMessage reads message from Error and PostgREST-style objects",
  () => {
    assertStrictEquals(thrownMessage(new Error("boom")), "boom");
    assertStrictEquals(
      thrownMessage({ message: "row missing", code: "PGRST116" }),
      "row missing",
    );
    assertStrictEquals(thrownMessage("plain"), undefined);
    assertStrictEquals(thrownMessage(null), undefined);
  },
);
