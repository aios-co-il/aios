import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { clientPerformanceEntry } from "./client-performance.ts";

const meta = {
  id: "m",
  integration_type: "facebook_insights",
  integration_settings: {},
};
const client = { id: "c1", name: "לקוח", agencies: { name: "סוכנות" } };

/** A stored Meta campaign × day row. */
const day = (date: string, data: Record<string, unknown>) => ({
  table_id: "m",
  data: { date, ...data },
});

const leads = { campaign_id: "2", campaign_objective: "OUTCOME_LEADS" };
const sales = { campaign_id: "1", campaign_objective: "OUTCOME_SALES" };
const traffic = {
  campaign_id: "3",
  campaign_objective: "OUTCOME_TRAFFIC",
  optimization_goal: "LANDING_PAGE_VIEWS",
};

describe("clientPerformanceEntry", () => {
  it("counts leads only from lead campaigns and purchases only from sales campaigns", () => {
    const entry = clientPerformanceEntry({
      client,
      records: [
        day("2026-11-03", { ...leads, spend: 50, leads: 5 }),
        day("2026-11-03", { ...sales, spend: 100, purchases: 2, leads: 3 }),
        day("2026-11-03", {
          ...traffic,
          spend: 30,
          conversions: 9,
          leads: 1,
        }),
      ],
      tables: [meta],
      d7Str: "2026-10-30",
      now: new Date("2026-11-06T10:00:00Z"),
    });
    assertEquals(
      {
        spend: entry.spend_7d,
        leadSpend: entry.lead_spend_7d,
        leads: entry.leads_7d,
        cpl: entry.cpl_7d,
        purchases: entry.purchases_7d,
        ecommerceSpend: entry.ecommerce_spend_7d,
        isEcommerce: entry.is_ecommerce,
      },
      {
        spend: 180,
        leadSpend: 50,
        leads: 5,
        cpl: 10,
        purchases: 2,
        ecommerceSpend: 100,
        isEcommerce: false,
      },
    );
  });

  it("is ecommerce by its report tables, as the pulse snapshot sets is_ecommerce", () => {
    const entry = clientPerformanceEntry({
      client,
      records: [
        day("2026-11-03", {
          ...sales,
          spend: 100,
          purchases: 2,
          purchase_value: 300,
        }),
      ],
      tables: [
        meta,
        { ...meta, id: "e", integration_type: "facebook_ecommerce" },
      ],
      d7Str: "2026-10-30",
      now: new Date("2026-11-06T10:00:00Z"),
    });
    assertEquals([entry.is_ecommerce, entry.alert], [true, "🟢 תקין"]);
  });

  it("a client with only lead campaigns is not ecommerce", () => {
    const entry = clientPerformanceEntry({
      client,
      records: [day("2026-11-03", { ...leads, spend: 50, leads: 5 })],
      tables: [meta],
      d7Str: "2026-10-30",
      now: new Date("2026-11-06T10:00:00Z"),
    });
    assertEquals([entry.is_ecommerce, entry.alert], [false, "🟢 תקין"]);
  });
});
