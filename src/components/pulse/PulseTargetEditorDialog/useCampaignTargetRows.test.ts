import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { campaignRow } from "./campaignRowFixture";
import {
  campaignRowTarget,
  useCampaignTargetRows,
} from "./useCampaignTargetRows";

describe("campaignRowTarget", () => {
  it("keeps the pulse row's campaign target and saves where it is stored", () => {
    const row = campaignRow({
      target_value: 60,
      target_kind: "cpl",
      target_source: "carmen_market",
      target_scope: "campaign",
      target_table_id: "t2",
      target_campaign_id: "c2",
    });
    const result = campaignRowTarget(row, new Map([["t1", {}]]));
    expect(result.target?.source).toBe("carmen_market");
    expect(result).toMatchObject({ tableId: "t2", campaignId: "c2" });
  });

  it("prefers a fresh approved target on the row's table over the row's market one", () => {
    const row = campaignRow({
      target_value: 60,
      target_kind: "cpl",
      target_source: "carmen_market",
      target_scope: "campaign",
    });
    const result = campaignRowTarget(
      row,
      new Map([["t1", { pulse_platform_targets: { leads: { cpl: 45 } } }]]),
    );
    expect(result.target).toMatchObject({ value: 45, source: "approved" });
    expect(result).toMatchObject({ tableId: "t1", campaignId: "c1" });
  });
});

describe("useCampaignTargetRows", () => {
  it("lists lead and ecommerce campaigns, biggest spend first", () => {
    const { result } = renderHook(() =>
      useCampaignTargetRows(
        [
          campaignRow({ campaign_key: "small", spend_7d: 100 }),
          campaignRow({ campaign_key: "video", goal: "engagement" }),
          campaignRow({ campaign_key: "big", spend_7d: 2000 }),
        ],
        new Map(),
      ),
    );
    expect(result.current.map((entry) => entry.row.campaign_key)).toEqual([
      "big",
      "small",
    ]);
    expect(result.current[0].saveTo).toEqual({
      tableIds: ["t1"],
      campaignId: "c1",
    });
  });
});
