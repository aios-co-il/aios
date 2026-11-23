import { useMemo } from "react";
import type { DashboardFacebookCampaigns } from "@/lib/dashboardCampaignGoals";
import type { CampaignOffTable } from "@/lib/campaignOffState";
import type { FacebookTabFormatters } from "@/components/FacebookReportTab/facebookColumns";
import type { FacebookTabRecord } from "@/components/FacebookReportTab/facebookTabFigures";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
} from "../GoogleAdsCampaignSection/types";
import { ContinentTables } from "./CampaignContinentsTab";
import { ContinentSummaryTable } from "./ContinentSummaryTable";
import { combinedContinents, combinedResults } from "./combinedContinents";
import { continentSections } from "./continentSections";
import { facebookContinentSections } from "./facebookContinentSections";
import { FacebookContinentTables } from "./FacebookContinentsTab";
import { useFacebookOnOf } from "./useFacebookOnOf";

type Props = {
  facebook: FacebookTabFormatters & {
    campaigns: DashboardFacebookCampaigns;
    records: Array<FacebookTabRecord>;
    tables: Array<CampaignOffTable>;
  };
  /** Each platform's formatters are in its own account's currency. */
  google: GoogleAdsFormatters & {
    campaigns: Array<GoogleAdsCampaignSummaryRow>;
  };
};

/**
 * Meta and Google Ads by continent on one page: a summary row per continent
 * with each platform's spend in its own currency (never added) and their
 * results together, then each continent's Meta tables and Google tables.
 */
export function CombinedContinentsTab({ facebook, google }: Props) {
  const {
    campaigns: facebookCampaigns,
    records,
    tables,
    ...facebookFormat
  } = facebook;
  const { campaigns: googleCampaigns, ...googleFormat } = google;
  const continents = useMemo(
    () =>
      combinedContinents(
        facebookContinentSections(facebookCampaigns),
        continentSections(googleCampaigns),
      ),
    [facebookCampaigns, googleCampaigns],
  );
  const onOf = useFacebookOnOf(records, tables);
  return (
    <div className="space-y-4">
      <ContinentSummaryTable
        groups={[
          { label: "Meta", span: 2 },
          { label: "Google Ads", span: 2 },
          { label: "סה״כ", span: 1 },
        ]}
        headers={["הוצאה", "תוצאות", "הוצאה", "המרות", "תוצאות"]}
        rows={continents.map(({ continent, title, facebook, google }) => ({
          continent,
          title,
          cells: [
            facebook
              ? facebookFormat.formatCurrency(facebook.totals.spend)
              : "-",
            facebook
              ? facebookFormat.formatNumber(
                  facebook.totals.leads + facebook.totals.purchases,
                )
              : "-",
            google ? googleFormat.formatCurrency(google.totals.spend) : "-",
            google ? googleFormat.formatNumber(google.totals.conversions) : "-",
            googleFormat.formatNumber(combinedResults({ facebook, google })),
          ],
        }))}
      />
      {continents.map(({ continent, title, facebook, google }) => (
        <section
          key={continent}
          id={`continent-${continent}`}
          className="space-y-4"
        >
          <h3 className="border-t pt-4 text-lg font-bold">{title}</h3>
          {facebook && (
            <FacebookContinentTables
              section={facebook}
              onOf={onOf}
              {...facebookFormat}
            />
          )}
          {google && (
            <ContinentTables
              section={{ ...google, title: `${title} - Google Ads` }}
              anchored={false}
              {...googleFormat}
            />
          )}
        </section>
      ))}
    </div>
  );
}
