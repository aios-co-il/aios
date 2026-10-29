import { describe, expect, it } from "vitest";
import { googleCampaignRowsByGoal } from "./googleCampaignRowsByGoal";

const record = (campaign_id: string, cost: number) => ({
  data: {
    date: "2026-10-20",
    entity_level: "campaign",
    campaign_id,
    campaign_name: campaign_id,
    cost,
  },
});

describe("googleCampaignRowsByGoal", () => {
  it("splits rows by their campaign's goal and lists sales rows first", () => {
    const rows = googleCampaignRowsByGoal(
      [record("lead", 40), record("shop", 100)],
      "campaign",
      (data) => (data?.campaign_id === "shop" ? "ecommerce" : "leads"),
    );
    expect(rows.ecommerce.map((row) => row.name)).toEqual(["shop"]);
    expect(rows.leads.map((row) => row.name)).toEqual(["lead"]);
    expect(rows.all.map((row) => [row.name, row.spend])).toEqual([
      ["shop", 100],
      ["lead", 40],
    ]);
  });
});
