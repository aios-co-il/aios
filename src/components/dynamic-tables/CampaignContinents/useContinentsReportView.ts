import { useEffect, useMemo, useState } from "react";
import {
  namesCampaignsByDestination,
  recordCampaignNames,
} from "./continentSections";

/** The views of an ads table report: the report, the weekly comparison and, for travel accounts, by continent. */
export type AdsReportView = "summary" | "weekly" | "continents";

/**
 * The selected view of a Google Ads table report, internal or shared, and
 * whether its campaigns earn the "לפי יבשות" tab. A period that drops the
 * tab sends the view back to the report, once that period's records have
 * loaded (`ready`), so a period still loading never resets it.
 */
export function useContinentsReportView(input: {
  integrationType: string | null | undefined;
  records: Array<{ data?: Record<string, unknown> | null }>;
  ready: boolean;
}) {
  const [view, setView] = useState<AdsReportView>("summary");
  const { integrationType, records, ready } = input;
  const hasContinentsTab = useMemo(
    () =>
      integrationType === "google_ads" &&
      namesCampaignsByDestination(recordCampaignNames(records)),
    [integrationType, records],
  );
  useEffect(() => {
    if (ready && view === "continents" && !hasContinentsTab) {
      setView("summary");
    }
  }, [ready, view, hasContinentsTab]);
  return { view, setView, hasContinentsTab };
}
