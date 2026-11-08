import { describe, expect, it } from "vitest";
import { dropBlankFields, toLeadInsert } from "./leadImport";

describe("dropBlankFields", () => {
  it("removes undefined, null and blank string fields", () => {
    expect(
      dropBlankFields({
        company_name: "Acme",
        email: "  ",
        phone: null,
        notes: undefined,
        monthly_budget: 0,
      }),
    ).toEqual({ company_name: "Acme", monthly_budget: 0 });
  });
});

describe("toLeadInsert", () => {
  it("returns the row when company name and source are valid", () => {
    expect(
      toLeadInsert({ company_name: "Acme", source: "website", status: "new" }),
    ).toEqual({ company_name: "Acme", source: "website", status: "new" });
    expect(toLeadInsert({ company_name: "Acme" })).toEqual({
      company_name: "Acme",
    });
  });

  it("throws like the database for a missing company name", () => {
    expect(() => toLeadInsert({ email: "a@b.co" })).toThrow(/company_name/);
  });

  it("preserves LinkedIn and other free-text sources", () => {
    for (const source of ["linkedin", "partner-event-2026", "custom source"]) {
      expect(toLeadInsert({ company_name: "Acme", source }).source).toBe(
        source,
      );
    }
  });
});
