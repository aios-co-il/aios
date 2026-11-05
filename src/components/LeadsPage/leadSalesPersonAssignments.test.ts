import { describe, expect, it } from "vitest";
import { buildLeadSalesPersonAssignments } from "./leadSalesPersonAssignments";

describe("buildLeadSalesPersonAssignments", () => {
  it("keeps each lead's tenant for every selected salesperson", () => {
    expect(
      buildLeadSalesPersonAssignments(
        [
          { id: "lead-a", tenant_id: "tenant-a" },
          { id: "lead-b", tenant_id: "tenant-b" },
        ],
        ["person-a", "person-b"],
      ),
    ).toEqual([
      { lead_id: "lead-a", sales_person_id: "person-a", tenant_id: "tenant-a" },
      { lead_id: "lead-a", sales_person_id: "person-b", tenant_id: "tenant-a" },
      { lead_id: "lead-b", sales_person_id: "person-a", tenant_id: "tenant-b" },
      { lead_id: "lead-b", sales_person_id: "person-b", tenant_id: "tenant-b" },
    ]);
  });

  it("rejects a missing tenant before producing a bulk payload", () => {
    expect(() =>
      buildLeadSalesPersonAssignments(
        [
          { id: "lead-a", tenant_id: "tenant-a" },
          { id: "lead-b", tenant_id: null },
        ],
        ["person-a"],
      ),
    ).toThrow("לא נבחר ארגון (tenant)");
  });

  it("keeps empty selections empty", () => {
    expect(buildLeadSalesPersonAssignments([], ["person-a"])).toEqual([]);
    expect(
      buildLeadSalesPersonAssignments([{ id: "lead-a", tenant_id: null }], []),
    ).toEqual([]);
  });
});
