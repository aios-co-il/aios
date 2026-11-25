import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSharedLevelRecords } from "./useSharedLevelRecords";

/** A row of campaign `campaignId` at one level. */
function row(level: "campaign" | "ad", campaignId: string) {
  return {
    id: `${level}-${campaignId}`,
    data: { entity_level: level, campaign_id: campaignId, spend: 1 },
  };
}

const records = [
  row("campaign", "c1"),
  row("campaign", "c2"),
  row("ad", "c1"),
  row("ad", "c2"),
];

describe("useSharedLevelRecords", () => {
  it("cuts the shown and the previous period to the level and picked campaign", () => {
    const { result } = renderHook(() => useSharedLevelRecords(records, true));

    act(() => result.current.setLevel("ad"));
    act(() => result.current.campaignFilter.onChange("c2"));

    expect(result.current.levelRecords).toEqual([records[3]]);
    expect(result.current.previousAtLevel(records)).toEqual([records[3]]);
  });

  it("keeps the campaign level whole whatever the pick", () => {
    const { result } = renderHook(() => useSharedLevelRecords(records, true));

    act(() => result.current.setLevel("ad"));
    act(() => result.current.campaignFilter.onChange("c2"));
    act(() => result.current.setLevel("campaign"));

    expect(result.current.levelRecords).toEqual(records.slice(0, 2));
    expect(result.current.previousAtLevel(records)).toEqual(
      records.slice(0, 2),
    );
  });
});
