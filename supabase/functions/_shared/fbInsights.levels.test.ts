import { assertEquals } from "jsr:@std/assert@1";
import { buildAllLevelInsightRecords } from "./fbInsights.ts";
import type { AdsEntityLevel } from "./ads-sync/levels.ts";

const CAMPAIGN_ID = "120250000000000001";
const statuses = {
  [CAMPAIGN_ID]: {
    id: CAMPAIGN_ID,
    name: "לידים",
    objective: "OUTCOME_LEADS",
    effective_status: "ACTIVE",
    configured_status: "ACTIVE",
  },
};
const ROW_IDS: Record<AdsEntityLevel, Record<string, string>> = {
  campaign: {},
  adset: { adset_id: "as-1", adset_name: "קבוצה" },
  ad: {
    adset_id: "as-1",
    adset_name: "קבוצה",
    ad_id: "ad-1",
    ad_name: "מודעה",
  },
};

/**
 * A Graph stub that answers each level's insights read after a short delay and
 * records how many of those reads were open at once.
 */
function stubGraph(failing?: AdsEntityLevel) {
  const seen = { open: 0, maxOpen: 0 };
  const fetchStub = async (input: string | URL | Request) => {
    const url = String(input);
    const level = url.match(/insights\?level=(campaign|adset|ad)&/)?.[1] as
      AdsEntityLevel | undefined;
    if (!level) {
      return Response.json({ data: [] });
    }
    seen.open += 1;
    seen.maxOpen = Math.max(seen.maxOpen, seen.open);
    await new Promise((resolve) => setTimeout(resolve, 20));
    seen.open -= 1;
    if (level === failing) {
      return Response.json({ error: { message: "ad level denied", code: 10 } });
    }
    return Response.json({
      data: [
        {
          date_start: "2026-11-01",
          campaign_id: CAMPAIGN_ID,
          campaign_name: "לידים",
          ...ROW_IDS[level],
          impressions: "100",
          clicks: "5",
          spend: "10",
        },
      ],
    });
  };
  return { seen, fetchStub };
}

async function buildWith(fetchStub: typeof fetch) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    return await buildAllLevelInsightRecords(
      "act_1",
      "2026-11-01",
      "2026-11-01",
      "token",
      statuses,
      {},
      {},
      { byCampaign: {}, byAdset: {} },
      { byCampaign: {}, byAdset: {} },
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}

Deno.test(
  "buildAllLevelInsightRecords reads the three levels at once, rows in level order",
  async () => {
    const { seen, fetchStub } = stubGraph();
    const result = await buildWith(fetchStub as typeof fetch);

    assertEquals(seen.maxOpen, 3);
    assertEquals(result.levelCounts, { campaign: 1, adset: 1, ad: 1 });
    assertEquals(result.levelErrors, {});
    assertEquals(
      result.records.map((record) => record.entity_level ?? "campaign"),
      ["campaign", "adset", "ad"],
    );
  },
);

Deno.test(
  "buildAllLevelInsightRecords keeps the other levels when one level read fails",
  async () => {
    const { fetchStub } = stubGraph("ad");
    const result = await buildWith(fetchStub as typeof fetch);

    assertEquals(result.levelCounts, { campaign: 1, adset: 1, ad: 0 });
    assertEquals(Object.keys(result.levelErrors), ["ad"]);
    assertEquals(result.records.length, 2);
  },
);
