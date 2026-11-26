import { useMemo, useState } from "react";
import { filterRecordsByCampaign } from "@/components/reports/AdsCampaignFilter/adsCampaignFilter";
import { useAdsCampaignFilter } from "@/components/reports/AdsCampaignFilter/useAdsCampaignFilter";
import {
  type AdsEntityLevel,
  filterRecordsByEntityLevel,
} from "@/lib/adsEntityLevel";
import type { SharedTableRecord } from "./publicTableApi";

/**
 * A share's entity level and campaign pick, as on the internal report: the
 * period's records at that level and campaign, and `previousAtLevel` to cut
 * the previous period the same way. A non-ads share keeps every record.
 */
export function useSharedLevelRecords(
  allRecords: Array<SharedTableRecord>,
  isAds: boolean,
) {
  const [level, setLevel] = useState<AdsEntityLevel>("campaign");
  // No pre-filter by report_type, like the internal report; the edge function
  // applies the date window the internal report uses.
  const allLevelRecords = useMemo(
    () => (isAds ? filterRecordsByEntityLevel(allRecords, level) : allRecords),
    [allRecords, isAds, level],
  );
  const campaignFilter = useAdsCampaignFilter(allLevelRecords, level);

  /** The previous period's records at the shown level and campaign. */
  function previousAtLevel(previous: Array<SharedTableRecord>) {
    return filterRecordsByEntityLevel(
      filterRecordsByCampaign(previous, campaignFilter.control.value),
      level,
    );
  }

  return {
    level,
    setLevel,
    levelRecords: campaignFilter.records,
    campaignFilter: campaignFilter.control,
    previousAtLevel,
  };
}
