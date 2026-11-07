import { expect, test } from "vitest";
import { z } from "zod";
import {
  asJsonArray,
  asJsonObject,
  errorMessage,
  jsonObjects,
  jsonObjectSchema,
  listOf,
  parseEach,
  parseJsonFloat,
  readDateInput,
  readField,
  readFloat,
  readString,
  readText,
  thrownCode,
  thrownMessage,
} from "./jsonReaders.ts";

test("asJsonObject keeps plain objects and replaces everything else", () => {
  const settings = { clientId: "c1" };
  expect(asJsonObject(settings)).toBe(settings);
  expect(asJsonObject(null)).toStrictEqual({});
  expect(asJsonObject([1, 2])).toStrictEqual({});
  expect(asJsonObject("x")).toStrictEqual({});
});

test("asJsonArray and jsonObjects only accept arrays", () => {
  const list = [{ id: "a" }, "b", null];
  expect(asJsonArray(list)).toBe(list);
  expect(asJsonArray({ 0: "a" })).toStrictEqual([]);
  expect(jsonObjects(list)).toStrictEqual([{ id: "a" }]);
  expect(jsonObjects(undefined)).toStrictEqual([]);
});

test("field readers narrow by runtime type", () => {
  const data = { name: "Acme", count: 7, flag: true, spend: "12.5" };
  expect(readString(data, "name")).toBe("Acme");
  expect(readString(data, "count")).toBe(undefined);
  expect(readText(data, "count")).toBe("7");
  expect(readText(data, "flag")).toBe(undefined);
  expect(readDateInput(data, "count")).toBe(7);
  expect(readString(["Acme"], "0")).toBe(undefined);
});

test("readFloat matches parseFloat on the raw value", () => {
  expect(readFloat({ spend: "12.5" }, "spend")).toBe(12.5);
  expect(readFloat({ spend: 3 }, "spend")).toBe(3);
  expect(Number.isNaN(readFloat({}, "spend"))).toBe(true);
  expect(Number.isNaN(readFloat(undefined, "spend"))).toBe(true);
});

test("errorMessage reads message from Error and error-like objects", () => {
  expect(errorMessage(new Error("boom"))).toBe("boom");
  expect(errorMessage({ message: "pg failed", code: "42501" })).toBe(
    "pg failed",
  );
  expect(errorMessage("plain")).toBe(undefined);
  expect(errorMessage(null)).toBe(undefined);
  expect(errorMessage({ message: 42 })).toBe(undefined);
});

test("readField returns raw fields of objects only", () => {
  expect(readField({ error: "boom" }, "error")).toBe("boom");
  expect(readField("not-an-object", "error")).toBe(undefined);
  expect(readField(null, "error")).toBe(undefined);
});

test("parseJsonFloat matches parseFloat's string coercion", () => {
  expect(parseJsonFloat("12.5")).toBe(12.5);
  expect(parseJsonFloat(3)).toBe(3);
  expect(Number.isNaN(parseJsonFloat(undefined))).toBe(true);
  expect(Number.isNaN(parseJsonFloat(null))).toBe(true);
});

test("thrown values read message and code like optional chaining did", () => {
  const pgError = { message: "duplicate", code: "23505" };
  expect(thrownMessage(pgError)).toBe("duplicate");
  expect(thrownCode(pgError)).toBe("23505");
  expect(thrownMessage(new Error("boom"))).toBe("boom");
  expect(thrownMessage("text")).toBe(undefined);
  expect(thrownCode(null)).toBe(undefined);
});

test("parseEach keeps rows that parse and drops the rest", () => {
  const row = z.object({ id: z.string() });
  expect(parseEach(row, [{ id: "a" }, { id: 1 }, null, "x"])).toEqual([
    { id: "a" },
  ]);
  expect(parseEach(row, { id: "a" })).toEqual([]);
  expect(listOf(row).parse(undefined)).toEqual([]);
});

test("jsonObjectSchema accepts plain objects only", () => {
  expect(jsonObjectSchema.safeParse({ a: 1 }).success).toBe(true);
  expect(jsonObjectSchema.safeParse([]).success).toBe(false);
  expect(jsonObjectSchema.safeParse(null).success).toBe(false);
});
