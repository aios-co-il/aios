import { useMemo } from "react";
import { ContinentTables } from "./CampaignContinentsTab";
import { ContinentSummaryTable } from "./ContinentSummaryTable";
import { combinedContinents } from "./combinedContinents";
import {
  continentAnchor,
  type FacebookContinentsInput,
  type GoogleContinentsInput,
} from "./continentInputs";
import { continentSections } from "./continentSections";
import { facebookContinentSections } from "./facebookContinentSections";
import { FacebookContinentTables } from "./FacebookContinentsTab";
import { useFacebookOnOf } from "./useFacebookOnOf";

type Props = {
  facebook: FacebookContinentsInput;
  google: GoogleContinentsInput;
};

/**
 * Facebook and Google Ads by continent on one page: a summary row per
 * continent with each platform's spend and results side by side, each in its
 * own currency and never added together, then each continent's Facebook
 * tables and Google tables.
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
          { label: "Facebook", span: 2 },
          { label: "Google Ads", span: 2 },
        ]}
        headers={["הוצאה", "תוצאות", "הוצאה", "המרות"]}
        rows={continents.map(
          ({ continent, title, facebook: meta, google: ads }) => ({
            continent,
            title,
            cells: [
              meta ? facebookFormat.formatCurrency(meta.totals.spend) : "-",
              meta
                ? facebookFormat.formatNumber(
                    meta.totals.leads + meta.totals.purchases,
                  )
                : "-",
              ads ? googleFormat.formatCurrency(ads.totals.spend) : "-",
              ads ? googleFormat.formatNumber(ads.totals.conversions) : "-",
            ],
          }),
        )}
      />
      {continents.map(({ continent, title, facebook: meta, google: ads }) => (
        <section
          key={continent}
          id={continentAnchor(continent)}
          className="space-y-4"
        >
          <h3 className="border-t pt-4 text-lg font-bold">{title}</h3>
          {meta && (
            <FacebookContinentTables
              section={meta}
              onOf={onOf}
              {...facebookFormat}
            />
          )}
          {ads && (
            <ContinentTables
              section={{ ...ads, title: `${title} - Google Ads` }}
              anchored={false}
              {...googleFormat}
            />
          )}
        </section>
      ))}
    </div>
  );
}
