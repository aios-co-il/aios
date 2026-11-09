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

Deno.test(
  "phone calls counted as secondary are added to lead conversions",
  async (t) => {
    /** Enrich a campaign-level row of `campaign` with these category rows. */
    async function enriched(
      categoryRows: Array<GaqlRow>,
      goalRows: Array<GaqlRow>,
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
      await enrichConversionCategories(records, {
        ...WINDOW,
        runGaqlSearch: fakeGaql(categoryRows, goalRows),
      });
      return records[0];
    }

    await t.step("a lead campaign adds its secondary calls", async () => {
      // איימי בכור: form leads are primary, calls from ads are secondary.
      const row = await enriched(
        [
          categoryRow("search", "SUBMIT_LEAD_FORM", "2"),
          categoryRow("search", "PHONE_CALL_LEAD", "0", "3"),
        ],
        [goalRow("search", "SUBMIT_LEAD_FORM")],
      );
      assertEquals(row.conversions, 5);
      assertEquals(row.secondary_call_leads, 3);
      assertEquals(row.cost_per_conversion, 24);
    });

    await t.step("a primary call action is not counted twice", async () => {
      const row = await enriched(
        [categoryRow("search", "PHONE_CALL_LEAD", "2", "2")],
        [goalRow("search", "PHONE_CALL_LEAD")],
      );
      assertEquals(row.conversions, 2);
      assertEquals(row.secondary_call_leads, undefined);
    });

    await t.step("a sales campaign keeps its conversions", async () => {
      const row = await enriched(
        [categoryRow("search", "PHONE_CALL_LEAD", "0", "3")],
        [goalRow("search", "PURCHASE")],
      );
      assertEquals(row.conversions, 2);
    });

    await t.step("ad group rows keep Google's conversions", async () => {
      const row = await enriched(
        [categoryRow("search", "PHONE_CALL_LEAD", "0", "3")],
        [goalRow("search", "SUBMIT_LEAD_FORM")],
        "adset",
      );
      assertEquals(row.conversions, 2);
    });
  },
);
