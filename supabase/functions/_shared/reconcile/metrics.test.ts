import {
  assert,
  assertEquals,
  assertFalse,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  exceedsTolerance,
  primaryResultMetric,
  recordMetrics,
} from "./metrics.ts";
import { googleTable, metaTable } from "./test-fixtures.ts";

describe("exceedsTolerance", () => {
  it("allows a money floor of 20 or 2% of the platform value", () => {
    // Below 1,000 the floor of 20 wins; exactly at the threshold is not a mismatch.
    assertFalse(exceedsTolerance(1020, 1000, "money"));
    assert(exceedsTolerance(1020.01, 1000, "money"));
    assertFalse(exceedsTolerance(5, 0, "money"));
    assertFalse(exceedsTolerance(0, 20, "money"));
    assert(exceedsTolerance(0, 20.01, "money"));
    // Above 1,000 the 2% wins: 2% of 5,000 is 100.
    assertFalse(exceedsTolerance(4900, 5000, "money"));
    assert(exceedsTolerance(4899.99, 5000, "money"));
  });

  it("allows result counts one off, then 2%", () => {
    assertFalse(exceedsTolerance(9, 10, "count"));
    assert(exceedsTolerance(8, 10, "count"));
    assertFalse(exceedsTolerance(98, 100, "count"));
    assert(exceedsTolerance(97, 100, "count"));
    // Floating noise does not create a mismatch at the boundary.
    assertFalse(exceedsTolerance(0.1 + 0.2 + 19.7, 0, "money"));
  });
});

describe("recordMetrics", () => {
  it("counts a Meta record's results as the report does", () => {
    // WhatsApp conversations and form leads are leads in the report.
    assertEquals(recordMetrics("meta", { spend: 100, conversations: 5 }), {
      spend: 100,
      leads: 5,
      purchases: 0,
      conversions: 0,
      revenue: 0,
    });
    assertStrictEquals(recordMetrics("meta", { form_leads: 3 }).leads, 3);
    assertEquals(
      recordMetrics("meta", { spend: 50, purchases: 2, purchase_value: 400 }),
      { spend: 50, leads: 0, purchases: 2, conversions: 0, revenue: 400 },
    );
  });

  it("keeps a Google record's own columns", () => {
    assertEquals(
      recordMetrics("google", {
        cost: 210.5,
        conversions: 7.5,
        conversions_value: 30,
      }),
      { spend: 210.5, leads: 0, purchases: 0, conversions: 7.5, revenue: 30 },
    );
  });
});

describe("primaryResultMetric", () => {
  const meta = (rows: Array<Record<string, unknown>>, table = metaTable) =>
    primaryResultMetric(
      "meta",
      rows.map((data) => ({ campaign_id: "1", ...data })),
      table,
    );

  it("follows the campaign's report goal over its rows", () => {
    assertStrictEquals(
      meta([{ campaign_objective: "OUTCOME_SALES" }]),
      "purchases",
    );
    assertStrictEquals(
      meta([{ campaign_objective: "OUTCOME_LEADS" }]),
      "leads",
    );
    // Traffic is measured on spend only.
    assertStrictEquals(
      meta([
        {
          campaign_objective: "OUTCOME_TRAFFIC",
          optimization_goal: "LANDING_PAGE_VIEWS",
        },
      ]),
      null,
    );
    // A purchase on any day makes it a sales campaign, as the report adds the days up.
    assertStrictEquals(
      meta([{ spend: 10 }, { spend: 10, purchases: 1, purchase_value: 90 }]),
      "purchases",
    );
  });

  it("checks leads on an ecommerce table when nothing says sales", () => {
    // The report judges facebook_ecommerce campaigns by their own signals.
    assertStrictEquals(
      meta([{ spend: 10, leads: 2 }], {
        ...metaTable,
        integration_type: "facebook_ecommerce",
      }),
      "leads",
    );
  });

  it("keeps a leads-only table's campaigns on leads", () => {
    assertStrictEquals(
      meta([{ campaign_objective: "OUTCOME_SALES" }], {
        ...metaTable,
        integration_settings: { campaign_type: "leads" },
      }),
      "leads",
    );
  });

  it("checks Google campaigns on conversions", () => {
    assertStrictEquals(
      primaryResultMetric("google", [], googleTable),
      "conversions",
    );
  });
});
