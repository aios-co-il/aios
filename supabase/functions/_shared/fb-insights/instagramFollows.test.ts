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
 * follows; a read that asks for Meta's `instagram_profile_follow` field
 * returns `follows` (or an error). Meta accepts `instagram_profile_follow_v2`
 * but returns no value for it, so a read asking only for that gets no follows.
 */
function graph(follows: unknown): typeof fetch {
  return async (input) => {
    const url = String(input);
    const fields = new URL(url).searchParams.get("fields")?.split(",") ?? [];
    if (fields.includes("instagram_profile_follow")) {
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
              instagram_profile_follow: "12",
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

Deno.test("Instagram follows per ad set and per campaign", async () => {
  // Two ad sets of one profile visit campaign on one day; Meta reports each
  // ad set's own follows and the campaign's total (205 + 161).
  const adsetRow = (adsetId: string, name: string) => ({
    ...insightRow,
    adset_id: adsetId,
    adset_name: name,
  });
  const mainRows: Record<string, unknown[]> = {
    campaign: [insightRow],
    adset: [adsetRow("a1", "Inheritance"), adsetRow("a2", "Bank account")],
    ad: [],
  };
  const followRows: Record<string, unknown[]> = {
    campaign: [
      {
        campaign_id: CAMPAIGN,
        date_start: "2026-11-01",
        instagram_profile_follow: "366",
      },
    ],
    adset: [
      {
        adset_id: "a1",
        date_start: "2026-11-01",
        instagram_profile_follow: "205",
      },
      {
        adset_id: "a2",
        date_start: "2026-11-01",
        instagram_profile_follow: "161",
      },
    ],
    ad: [],
  };
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const level = url.searchParams.get("level") ?? "";
    const fields = url.searchParams.get("fields")?.split(",") ?? [];
    const data = fields.includes("instagram_profile_follow")
      ? followRows[level]
      : mainRows[level];
    return new Response(JSON.stringify({ data: data ?? [] }));
  };
  const { records } = await syncedCampaignRows(fetchImpl);
  const followersOf = (level: string, id: string) =>
    records.find(
      (row) =>
        row.entity_level === level &&
        (level === "adset" ? row.adset_id === id : row.campaign_id === id),
    )?.new_followers;
  assertEquals(followersOf("adset", "a1"), 205);
  assertEquals(followersOf("adset", "a2"), 161);
  assertEquals(followersOf("campaign", CAMPAIGN), 366);
});

Deno.test("fetchInstagramFollows", async (t) => {
  await t.step("asks Meta nothing without profile campaigns", async () => {
    let requests = 0;
    const fetchPage: typeof fetch = () => {
      requests += 1;
      return Promise.resolve(new Response("{}"));
    };
    const follows = await fetchInstagramFollows(
      "act_1",
      "campaign",
      "2026-11-01",
      "2026-11-02",
      "token",
      [],
      fetchPage,
    );
    assertEquals(follows.size, 0);
    assertEquals(requests, 0);
  });

  await t.step("asks only for the given campaigns", async () => {
    const urls: Array<string> = [];
    const fetchPage: typeof fetch = (input) => {
      urls.push(String(input));
      return Promise.resolve(new Response(JSON.stringify({ data: [] })));
    };
    await fetchInstagramFollows(
      "act_1",
      "campaign",
      "2026-11-01",
      "2026-11-02",
      "token",
      ["c1", "c2"],
      fetchPage,
    );
    const filtering = new URL(urls[0]).searchParams.get("filtering");
    assertEquals(JSON.parse(filtering ?? "[]"), [
      { field: "campaign.id", operator: "IN", value: ["c1", "c2"] },
    ]);
  });

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
      ["c1"],
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
