import { assertEquals } from "jsr:@std/assert@1";
import { buildAllLevelInsightRecords } from "../fbInsights.ts";
import {
  fetchInstagramFollows,
  INSTAGRAM_FOLLOWS_FIELD,
} from "./instagramFollows.ts";

const CAMPAIGN = "120249726329550459";

/** A campaign-level Graph insights row of an Instagram traffic campaign. */
const insightRow = {
  campaign_id: CAMPAIGN,
  campaign_name: "קמפיין טראפיק לאינסטגרם",
  date_start: "2026-11-01",
  date_stop: "2026-11-01",
  impressions: "5000",
  clicks: "160",
  spend: "120",
  actions: [{ action_type: "link_click", value: "150" }],
};

/**
 * Graph responses: the main insights read returns `insightRow` without
 * follows; the Instagram follows read returns `follows` (or an error).
 */
function graph(follows: unknown): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes(INSTAGRAM_FOLLOWS_FIELD)) {
      return new Response(JSON.stringify(follows));
    }
    const level = url.match(/level=(\w+)/)?.[1];
    return new Response(
      JSON.stringify({ data: level === "campaign" ? [insightRow] : [] }),
    );
  };
}

/** Run the shared sync build against `fetchImpl`, restoring fetch after. */
async function syncedCampaignRows(fetchImpl: typeof fetch) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const { records, levelErrors } = await buildAllLevelInsightRecords(
      "act_268355836999601",
      "2026-11-01",
      "2026-11-01",
      "token",
      { [CAMPAIGN]: { objective: "OUTCOME_TRAFFIC" } },
      {},
      {},
      { byCampaign: {}, byAdset: {} },
      { byCampaign: { [CAMPAIGN]: "INSTAGRAM_PROFILE" }, byAdset: {} },
    );
    return { records, levelErrors };
  } finally {
    globalThis.fetch = realFetch;
  }
}

Deno.test("Instagram follows in the insights sync", async (t) => {
  await t.step(
    "stores Ads Manager's Instagram follows on the row",
    async () => {
      const { records } = await syncedCampaignRows(
        graph({
          data: [
            {
              campaign_id: CAMPAIGN,
              date_start: "2026-11-01",
              [INSTAGRAM_FOLLOWS_FIELD]: "12",
            },
          ],
        }),
      );
      assertEquals(records.length, 1);
      assertEquals(records[0].new_followers, 12);
      assertEquals(records[0].destination_type, "INSTAGRAM_PROFILE");
    },
  );

  await t.step(
    "a failed follows read keeps the sync and its rows",
    async () => {
      const { records, levelErrors } = await syncedCampaignRows(
        graph({ error: { message: "(#100) Unknown field" } }),
      );
      assertEquals(levelErrors, {});
      assertEquals(records.length, 1);
      assertEquals(records[0].new_followers, 0);
    },
  );
});

Deno.test("fetchInstagramFollows", async (t) => {
  await t.step("keys follows by entity and day across pages", async () => {
    const pages: Record<string, unknown> = {
      first: {
        data: [
          {
            adset_id: "a1",
            date_start: "2026-11-01",
            [INSTAGRAM_FOLLOWS_FIELD]: "4",
          },
          {
            adset_id: "a2",
            date_start: "2026-11-01",
            [INSTAGRAM_FOLLOWS_FIELD]: "0",
          },
        ],
        paging: { next: "https://graph.facebook.com/next" },
      },
      next: {
        data: [
          {
            adset_id: "a1",
            date_start: "2026-11-02",
            [INSTAGRAM_FOLLOWS_FIELD]: "6",
          },
        ],
      },
    };
    const fetchPage: typeof fetch = async (input) =>
      new Response(
        JSON.stringify(
          String(input).endsWith("/next") ? pages.next : pages.first,
        ),
      );
    const follows = await fetchInstagramFollows(
      "act_1",
      "adset",
      "2026-11-01",
      "2026-11-02",
      "token",
      fetchPage,
    );
    assertEquals(
      [...follows.entries()],
      [
        ["adset:a1:2026-11-01", 4],
        ["adset:a1:2026-11-02", 6],
      ],
    );
  });
});
