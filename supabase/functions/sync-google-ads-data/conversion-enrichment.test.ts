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
