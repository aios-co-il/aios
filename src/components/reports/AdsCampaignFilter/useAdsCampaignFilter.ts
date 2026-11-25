import { useMemo, useState } from "react";
import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import {
  type AdsCampaignOption,
  filterRecordsByCampaign,
  listAdsCampaigns,
  resolveAdsCampaignKey,
} from "./adsCampaignFilter";

/** What the campaign picker beside the level tabs shows and sets. */
export type AdsCampaignFilterControl = {
  campaigns: Array<AdsCampaignOption>;
  /** The campaign shown, or null for every campaign. */
  value: string | null;
  onChange: (campaignKey: string | null) => void;
};

/**
 * The report's campaign pick for the ad set and ad tabs. The pick is kept
 * while switching between those tabs; `records` are the level's records of
 * that campaign, and `campaignKey` narrows the previous period the same way.
 */
export function useAdsCampaignFilter<
  T extends { data?: Record<string, unknown> },
>(levelRecords: Array<T>, level: AdsEntityLevel) {
  const [selected, setSelected] = useState<string | null>(null);
  const campaigns = useMemo(
    () => listAdsCampaigns(levelRecords, level),
    [levelRecords, level],
  );
  const campaignKey = resolveAdsCampaignKey(level, selected, campaigns);
  const records = useMemo(
    () => filterRecordsByCampaign(levelRecords, campaignKey),
    [levelRecords, campaignKey],
  );
  const control: AdsCampaignFilterControl = {
    campaigns,
    value: campaignKey,
    onChange: setSelected,
  };
  return { campaignKey, records, control };
}
