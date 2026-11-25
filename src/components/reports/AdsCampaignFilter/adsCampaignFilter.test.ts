import { describe, expect, it } from "vitest";
import {
  filterRecordsByCampaign,
  listAdsCampaigns,
  resolveAdsCampaignKey,
} from "./adsCampaignFilter";

/** A Facebook row at one level of one campaign. */
function row(
  level: "adset" | "ad",
  campaignId: string,
  campaignName: string,
  spend: number,
  name = `${level}-${campaignId}`,
) {
  return {
    data: {
      entity_level: level,
      campaign_id: campaignId,
      campaign_name: campaignName,
      adset_id: name,
      adset_name: name,
      ad_id: name,
      ad_name: name,
      spend,
    },
  };
}

describe("listAdsCampaigns", () => {
  it("lists each campaign with rows once, biggest spend first", () => {
    const records = [
      row("ad", "c1", "חורף", 10, "a1"),
      row("ad", "c2", "קיץ", 50, "a2"),
      row("ad", "c1", "חורף", 15, "a3"),
    ];

    expect(listAdsCampaigns(records, "ad")).toEqual([
      { key: "c2", name: "קיץ", spend: 50 },
      { key: "c1", name: "חורף", spend: 25 },
    ]);
  });

  it("reads Google Ads cost and keys a row without an id by name", () => {
    const records = [
      { data: { entity_level: "adset", campaign_name: "חיפוש", cost: 7 } },
    ];

    expect(listAdsCampaigns(records, "adset")).toEqual([
      { key: "חיפוש", name: "חיפוש", spend: 7 },
    ]);
  });

  it("lists none on the campaign level", () => {
    expect(listAdsCampaigns([row("ad", "c1", "חורף", 10)], "campaign")).toEqual(
      [],
    );
  });
});

describe("resolveAdsCampaignKey", () => {
  const campaigns = [{ key: "c1", name: "חורף", spend: 1 }];

  it("keeps a pick that has rows", () => {
    expect(resolveAdsCampaignKey("ad", "c1", campaigns)).toBe("c1");
  });

  it("shows every campaign with no pick, a pick without rows, or on the campaign level", () => {
    expect(resolveAdsCampaignKey("ad", null, campaigns)).toBeNull();
    expect(resolveAdsCampaignKey("adset", "c9", campaigns)).toBeNull();
    expect(resolveAdsCampaignKey("campaign", "c1", campaigns)).toBeNull();
  });
});

describe("filterRecordsByCampaign", () => {
  const adsets = [row("adset", "c1", "חורף", 1), row("adset", "c2", "קיץ", 2)];
  const ads = [row("ad", "c1", "חורף", 1), row("ad", "c2", "קיץ", 2)];

  it("keeps only the picked campaign's ad sets and ads", () => {
    expect(filterRecordsByCampaign(adsets, "c2")).toEqual([adsets[1]]);
    expect(filterRecordsByCampaign(ads, "c1")).toEqual([ads[0]]);
  });

  it("keeps every row with no pick", () => {
    expect(filterRecordsByCampaign(ads, null)).toBe(ads);
  });
});
