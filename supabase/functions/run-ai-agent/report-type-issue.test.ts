import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { reportTypeIssue } from "./report-type-issue.ts";

describe("reportTypeIssue", () => {
  it("flags sales spend in a leads-only report and splits spend by objective", () => {
    const out = reportTypeIssue(
      [
        { objective: "OUTCOME_SALES", spend: 400 },
        { objective: "OUTCOME_LEADS", spend: 100.25 },
        { objective: "OUTCOME_TRAFFIC", spend: 10 },
      ],
      "leads",
    );
    assertStrictEquals(
      out.typeIssue,
      "הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪400)",
    );
    assertEquals(out.spendByObjective, {
      ecommerce: 400,
      leads: 100.25,
      other: 10,
    });
    assertStrictEquals(out.metaSpend, 510.25);
  });

  it("flags an ecommerce report that is mostly leads, and passes a mixed one", () => {
    const rows = [
      { objective: "OUTCOME_SALES", spend: 100 },
      { objective: "LEAD_GENERATION", spend: 300 },
    ];
    assertStrictEquals(
      reportTypeIssue(rows, "ecommerce").typeIssue,
      "הדוח מוגדר איקומרס אבל רוב ההוצאה במטא על קמפייני לידים (₪300)",
    );
    assertStrictEquals(reportTypeIssue(rows, "mixed").typeIssue, null);
    assertStrictEquals(reportTypeIssue().typeIssue, null);
  });
});
