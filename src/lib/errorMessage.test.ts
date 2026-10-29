import { expect, test } from "vitest";
import { errorMessageOf } from "./errorMessage.ts";

test("errorMessageOf reads the message of an Error", () => {
  expect(errorMessageOf(new Error("boom"))).toBe("boom");
});

test("errorMessageOf reads the message of an error-like object", () => {
  expect(errorMessageOf({ message: "row not found", code: "PGRST116" })).toBe(
    "row not found",
  );
});

test("errorMessageOf returns undefined without a string message", () => {
  expect(errorMessageOf("oops")).toBe(undefined);
  expect(errorMessageOf(null)).toBe(undefined);
  expect(errorMessageOf({ message: 42 })).toBe(undefined);
  expect(errorMessageOf({})).toBe(undefined);
});
