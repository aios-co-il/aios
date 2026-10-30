import { describe, expect, it } from "vitest";
import { isSupplierType } from "./supplierType";

describe("isSupplierType", () => {
  it("accepts supplier_type enum values", () => {
    expect(isSupplierType("media")).toBe(true);
    expect(isSupplierType("other")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSupplierType("")).toBe(false);
    expect(isSupplierType("Media")).toBe(false);
    expect(isSupplierType(undefined)).toBe(false);
  });
});
