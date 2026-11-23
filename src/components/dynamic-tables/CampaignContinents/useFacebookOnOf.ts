import { useMemo } from "react";
import type { CampaignOffTable } from "@/lib/campaignOffState";
import {
  facebookCampaignOnOf,
  facebookCampaignRecords,
  type FacebookTabRecord,
} from "@/components/FacebookReportTab/facebookTabFigures";

/** Whether each Meta campaign is on, as the Facebook tab reads it. */
export function useFacebookOnOf(
  records: Array<FacebookTabRecord>,
  tables: Array<CampaignOffTable>,
): (name: string) => boolean {
  return useMemo(
    () => facebookCampaignOnOf(facebookCampaignRecords(records), tables),
    [records, tables],
  );
}
