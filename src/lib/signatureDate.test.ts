import { expect, test } from "vitest";
import { formatSignatureDate, parseSignatureDate } from "./signatureDate.ts";

test("iso date becomes day/month/year", () => {
  expect(formatSignatureDate("2026-09-24")).toBe("24/09/2026");
});

test("dotted and single-digit dates normalize", () => {
  expect(formatSignatureDate("4.9.2026")).toBe("04/09/2026");
});

test("invalid calendar dates stay unparsed", () => {
  expect(parseSignatureDate("31/02/2026")).toBe(undefined);
  expect(parseSignatureDate("24/09/2026")?.getDate()).toBe(24);
});
