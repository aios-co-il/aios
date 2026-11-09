import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  type ConversionEnrichedRecord,
  enrichConversionCategories,
} from "./conversion-enrichment.ts";
import type { GaqlRow, RunGaqlSearch } from "./conversion-gaql.ts";

const WINDOW = { startIso: "2026-10-20", endIso: "2026-10-21" };

const record = (campaign_id: string, date = "2026-10-20") => ({
  campaign_id,
  date,
  entity_level: "campaign" as const,
});

const categoryRow = (
  campaignId: string,
  category: string,
  conversions: string,
  allConversions = conversions,
) => ({
  campaign: { id: campaignId },
  segments: { date: "2026-10-20", conversionActionCategory: category },
  metrics: { conversions, allConversions },
});

const goalRow = (campaignId: string, category: string, biddable = true) => ({
  campaign: { id: campaignId },
  campaignConversionGoal: { category, biddable },
});

/** A GAQL client that answers the category query and the goal query with fixed rows. */
function fakeGaql(
  categoryRows: GaqlRow[],
  goalRows: GaqlRow[] | Error,
): RunGaqlSearch {
  return (query) => {
    if (!query.includes("campaign_conversion_goal")) {
      return Promise.resolve([{ results: categoryRows }]);
    }
    if (goalRows instanceof Error) {
      return Promise.reject(goalRows);
    }
    return Promise.resolve([{ results: goalRows }]);
  };
}

Deno.test("a campaign bidding on PURCHASE is stamped ecommerce", async () => {
  const records: ConversionEnrichedRecord[] = [record("pmax")];
  await enrichConversionCategories(records, {
    ...WINDOW,
    runGaqlSearch: fakeGaql(
      [categoryRow("pmax", "SUBMIT_LEAD_FORM", "4")],
      [goalRow("pmax", "PURCHASE"), goalRow("pmax", "PAGE_VIEW", false)],
    ),
  });
  assertStrictEquals(records[0].conversion_goal, "ecommerce");
});

Deno.test(
  "a failed goal query still stamps the goal from the conversions",
  async () => {
    const records: ConversionEnrichedRecord[] = [record("search")];
    await enrichConversionCategories(records, {
      ...WINDOW,
      runGaqlSearch: fakeGaql(
        [
          categoryRow("search", "SUBMIT_LEAD_FORM", "5"),
          categoryRow("search", "PURCHASE", "1"),
        ],
        new Error("campaign_conversion_goal not available"),
      ),
    });
    assertStrictEquals(records[0].conversion_goal, "leads");
  },
);

Deno.test("add_to_cart is written only for ecommerce tables", async () => {
  const rows = [
    categoryRow("pmax", "PURCHASE", "2"),
    categoryRow("pmax", "ADD_TO_CART", "0", "7"),
  ];
  const leadsTable: ConversionEnrichedRecord[] = [record("pmax")];
  await enrichConversionCategories(leadsTable, {
    ...WINDOW,
    campaignType: "leads",
    runGaqlSearch: fakeGaql(rows, []),
  });
  assertStrictEquals(leadsTable[0].add_to_cart, undefined);

  const ecommerceTable: ConversionEnrichedRecord[] = [
    record("pmax"),
    record("pmax", "2026-10-21"),
  ];
  await enrichConversionCategories(ecommerceTable, {
    ...WINDOW,
    campaignType: "ecommerce",
    runGaqlSearch: fakeGaql(rows, []),
  });
  assertEquals(
    ecommerceTable.map((rec) => rec.add_to_cart),
    [7, 0],
  );
});

Deno.test(
  "a campaign with no goal and no conversions stays unstamped",
  async () => {
    const records: ConversionEnrichedRecord[] = [record("display")];
    await enrichConversionCategories(records, {
      ...WINDOW,
      runGaqlSearch: fakeGaql([categoryRow("display", "PAGE_VIEW", "9")], []),
    });
    assertStrictEquals(records[0].conversion_goal, undefined);
    assertStrictEquals("conversion_goal" in records[0], false);
  },
);

Deno.test("every phone call is a lead campaign's conversion", async (t) => {
  const AD_CALL = "customers/1/conversionActions/10";
  const SITE_CALL = "customers/1/conversionActions/11";
  const TEL_TAP = "customers/1/conversionActions/12";
  const FORM = "customers/1/conversionActions/13";
  const actions = [
    { resourceName: AD_CALL, type: "AD_CALL", category: "CONTACT" },
    { resourceName: SITE_CALL, type: "WEBSITE_CALL", category: "CONTACT" },
    { resourceName: TEL_TAP, type: "WEBPAGE", category: "PHONE_CALL_LEAD" },
    { resourceName: FORM, type: "WEBPAGE", category: "SUBMIT_LEAD_FORM" },
  ];

  /** A row of the per-action query for campaign "search". */
  function actionRow(action: string, conversions: string, all: string) {
    return {
      campaign: { id: "search" },
      segments: { date: "2026-10-20", conversionAction: action },
      metrics: { conversions, allConversions: all },
    };
  }

  /** Enrich one row of campaign "search" against these per-action rows. */
  async function enriched(
    actionRows: Array<GaqlRow>,
    goal: string,
    entity_level: "campaign" | "adset" = "campaign",
  ) {
    const records: Array<ConversionEnrichedRecord> = [
      {
        ...record("search"),
        entity_level,
        conversions: 2,
        cost: 120,
        cost_per_conversion: 60,
      },
    ];
    const runGaqlSearch: RunGaqlSearch = (query) => {
      if (query.includes("FROM conversion_action")) {
        return Promise.resolve([
          { results: actions.map((action) => ({ conversionAction: action })) },
        ]);
      }
      if (query.includes("segments.conversion_action,")) {
        return Promise.resolve([{ results: actionRows }]);
      }
      if (query.includes("campaign_conversion_goal")) {
        return Promise.resolve([{ results: [goalRow("search", goal)] }]);
      }
      return Promise.resolve([{ results: [] }]);
    };
    await enrichConversionCategories(records, { ...WINDOW, runGaqlSearch });
    return records[0];
  }

  await t.step(
    "adds calls from the ad and the site, primary or not",
    async () => {
      // איימי בכור: the form is primary, calls are secondary or filed as Contact.
      const row = await enriched(
        [
          actionRow(FORM, "2", "2"),
          actionRow(AD_CALL, "0", "3"),
          actionRow(SITE_CALL, "0", "1"),
          actionRow(TEL_TAP, "0", "1"),
        ],
        "SUBMIT_LEAD_FORM",
      );
      assertEquals(row.conversions, 7);
      assertEquals(row.added_call_leads, 5);
      assertEquals(row.cost_per_conversion, 120 / 7);
    },
  );

  await t.step("a primary call is not counted twice", async () => {
    const row = await enriched(
      [actionRow(AD_CALL, "2", "2")],
      "PHONE_CALL_LEAD",
    );
    assertEquals(row.conversions, 2);
    assertEquals(row.added_call_leads, undefined);
  });

  await t.step("a sales campaign keeps its conversions", async () => {
    const row = await enriched([actionRow(AD_CALL, "0", "3")], "PURCHASE");
    assertEquals(row.conversions, 2);
  });

  await t.step("ad group rows keep Google's conversions", async () => {
    const row = await enriched(
      [actionRow(AD_CALL, "0", "3")],
      "SUBMIT_LEAD_FORM",
      "adset",
    );
    assertEquals(row.conversions, 2);
  });
});
