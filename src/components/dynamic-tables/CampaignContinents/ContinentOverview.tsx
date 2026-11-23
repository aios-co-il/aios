import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import { ContinentSummaryTable } from "./ContinentSummaryTable";
import {
  GOOGLE_SUMMARY_HEADERS,
  googleSummaryCells,
  type ContinentSection,
} from "./continentSections";

type Props = GoogleAdsFormatters & { sections: Array<ContinentSection> };

/** One row per continent of Google Ads campaigns. */
export function ContinentOverview({ sections, ...formats }: Props) {
  return (
    <ContinentSummaryTable
      headers={GOOGLE_SUMMARY_HEADERS}
      rows={sections.map((section) => ({
        continent: section.continent,
        title: section.title,
        cells: googleSummaryCells(section, formats),
      }))}
    />
  );
}
