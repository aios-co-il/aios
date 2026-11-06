import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { reportCampaignGoalOf } from "../_shared/campaign-goal/campaign-goals.ts";
import { facebookReportType, reportTypeIssue } from "./report-type-issue.ts";

/** A Meta campaign × day row, shaped like buildInsightRecord's output. */
const row = (campaign_id: string, data: Record<string, unknown>) => ({
  campaign_id,
  date: "2026-10-20",
  data: { campaign_id, date: "2026-10-20", ...data },
});

const sales = row("1", {
  campaign_objective: "OUTCOME_SALES",
  spend: 400,
  purchases: 3,
});
const leads = row("2", {
  campaign_objective: "OUTCOME_LEADS",
  spend: 100.25,
  leads: 7,
});
const traffic = row("3", {
  campaign_objective: "OUTCOME_TRAFFIC",
  optimization_goal: "LANDING_PAGE_VIEWS",
  spend: 10,
});

describe("reportTypeIssue", () => {
  it("flags sales spend in a leads-only report and splits spend by report goal", () => {
    const out = reportTypeIssue([sales, leads, traffic], "leads");
    assertStrictEquals(
      out.typeIssue,
      "הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪400)",
    );
    assertEquals(out.spendByGoal, {
      ecommerce: 400,
      leads: 100.25,
      traffic: 10,
    });
    assertStrictEquals(out.metaSpend, 510.25);
  });

  it("flags an ecommerce report that is mostly leads, and passes a mixed one", () => {
    const rows = [
      row("1", { campaign_objective: "OUTCOME_SALES", spend: 100 }),
      row("2", { campaign_objective: "LEAD_GENERATION", spend: 300 }),
    ];
    assertStrictEquals(
      reportTypeIssue(rows, "ecommerce").typeIssue,
      "הדוח מוגדר איקומרס אבל רוב ההוצאה במטא על קמפייני לידים (₪300)",
    );
    assertStrictEquals(reportTypeIssue(rows, "mixed").typeIssue, null);
    assertStrictEquals(reportTypeIssue().typeIssue, null);
  });

  it("counts a WhatsApp engagement campaign as leads, as the report does", () => {
    const whatsapp = row("4", {
      campaign_name: "וואטסאפ בוט AI",
      campaign_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "CONVERSATIONS",
      spend: 500,
      conversations: 12,
    });
    const out = reportTypeIssue([sales, whatsapp], "ecommerce");
    assertEquals(out.spendByGoal, { ecommerce: 400, leads: 500, traffic: 0 });
    assertStrictEquals(
      out.typeIssue,
      "הדוח מוגדר איקומרס אבל רוב ההוצאה במטא על קמפייני לידים (₪500)",
    );
  });

  it("judges a legacy CONVERSIONS campaign by its stored type and results", () => {
    const leadConversions = row("5", {
      campaign_objective: "CONVERSIONS",
      campaign_type: "lead",
      spend: 400,
      leads: 9,
    });
    const out = reportTypeIssue([leadConversions], "leads");
    assertStrictEquals(out.typeIssue, null);
    assertEquals(out.spendByGoal, { ecommerce: 0, leads: 400, traffic: 0 });

    const salesConversions = row("6", {
      campaign_objective: "CONVERSIONS",
      spend: 250,
      purchases: 4,
      purchase_value: 900,
    });
    assertStrictEquals(
      reportTypeIssue([salesConversions], "leads").typeIssue,
      "הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪250)",
    );
  });

  it("gives each campaign the goal a mixed report gives the same rows", () => {
    const rows = [
      sales,
      leads,
      traffic,
      row("1", {
        campaign_objective: "OUTCOME_SALES",
        spend: 50,
        leads: 2,
        date: "2026-10-21",
      }),
    ];
    const verdictOf = reportCampaignGoalOf(
      rows.map((r) => ({ table_id: "t", data: r.data })),
      [{ id: "t", integration_type: "facebook_insights" }],
    );
    const spend = { ecommerce: 0, leads: 0, traffic: 0 };
    for (const r of rows) {
      const goal = verdictOf({ table_id: "t", data: r.data })!.goal;
      spend[goal] += Number(r.data.spend);
    }
    assertEquals(reportTypeIssue(rows).spendByGoal, spend);
  });
});

describe("facebookReportType", () => {
  it("follows the table rules the reports use", () => {
    assertStrictEquals(
      facebookReportType("facebook_ecommerce", {}),
      "ecommerce",
    );
    assertStrictEquals(
      facebookReportType("facebook_insights", { campaign_type: "leads" }),
      "leads",
    );
    assertStrictEquals(
      facebookReportType("facebook_insights", { campaign_type: "lead" }),
      "leads",
    );
    assertStrictEquals(
      facebookReportType("facebook_insights", { campaign_type: "ecommerce" }),
      "ecommerce",
    );
    assertStrictEquals(facebookReportType("facebook_insights", {}), "mixed");
    assertStrictEquals(facebookReportType("facebook_insights", null), "mixed");
  });
});
