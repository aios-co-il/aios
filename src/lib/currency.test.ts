import { expect, test } from "vitest";
import { formatCurrency, formatUnitCost } from "./currency.ts";

test("formatCurrency defaults to whole units (spend / totals)", () => {
  expect(formatCurrency(566.4, "USD")).toMatch(/566/);
  expect(formatCurrency(566.4, "USD")).not.toMatch(/566\.4/);
});

test("formatUnitCost keeps cents so CPC does not collapse to $0", () => {
  // $566 spend / 1.9K clicks ≈ $0.30 — whole-unit formatting showed "$0".
  const cpc = 566 / 1900;
  expect(formatUnitCost(cpc, "USD")).toMatch(/0\.30/);
  expect(formatCurrency(cpc, "USD")).not.toMatch(/0\.30/);
});

test("formatUnitCost still formats larger unit costs with two decimals", () => {
  expect(formatUnitCost(1.95, "USD")).toMatch(/1\.95/);
});
