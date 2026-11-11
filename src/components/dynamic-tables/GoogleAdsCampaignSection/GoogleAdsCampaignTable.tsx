import { useState, type ReactNode } from "react";
import { ReportSection } from "@/components/report-ui/ReportSection";
import {
  ReportNameCell,
  ReportTable,
  ReportTr,
} from "@/components/report-ui/ReportTable";
import { ShowOffRowsToggle } from "@/components/report-ui/ShowOffRowsToggle";
import type { GoogleReportGoal } from "../../../../supabase/functions/_shared/campaign-goal/google-classify.ts";
import {
  GoogleAdsCampaignCells,
  GoogleAdsHeadCells,
} from "./GoogleAdsCampaignCells";
import { GoogleAdsCampaignTotalsRow } from "./GoogleAdsCampaignTotalsRow";
import {
  googleCampaignKey,
  googleComparedMetrics,
  type GoogleAdsTablePrevious,
} from "./googleAdsCompare";
import { CAMPAIGN_GOAL_TITLES } from "@/lib/campaignGoals";
import { addTotals, emptyTotals, googleStoreTotals } from "./googleAdsTotals";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
  GoogleAdsTotals,
  GoogleStoreTotals,
} from "./types";

type Props = GoogleAdsFormatters & {
  rows: GoogleAdsCampaignSummaryRow[];
  goal: GoogleReportGoal;
  groupTotals: GoogleAdsTotals;
  store: GoogleStoreTotals;
  /** The store totals come from WooCommerce, which cannot be split by campaign. */
  storeFromWoo?: boolean;
  mixed: boolean;
  icon: ReactNode;
  /** Replaces the goal title, as the continents tab names each table by its continent. */
  title?: string;
  /** The previous period; its columns show while it is set. */
  previous?: GoogleAdsTablePrevious | null;
};

/**
 * Per-campaign table of one goal: sales columns for ecommerce campaigns,
 * conversion columns for lead campaigns. A row's switch is off when the
 * report's operational check saw the campaign paused, removed or ended;
 * hiding those rows recomputes the total row from the rows shown.
 */
export function GoogleAdsCampaignTable({
  rows,
  goal,
  groupTotals,
  store,
  storeFromWoo = false,
  mixed,
  icon,
  title: titleOverride,
  previous,
  ...formats
}: Props) {
  const compared = previous ? googleComparedMetrics(goal, formats) : null;
  const [showOff, setShowOff] = useState(true);
  const isEcommerce = goal === "ecommerce";
  const isTraffic = goal === "traffic";
  // A sales campaign that also brought leads (calls, forms) shows them apart.
  const showLeads = isEcommerce && rows.some((row) => (row.leads ?? 0) > 0);
  const title = titleOverride ?? (mixed ? GOAL_TITLES[goal] : SINGLE_TITLE);
  const shown = showOff ? rows : rows.filter((row) => !row.off);
  const totals = shown.length === rows.length ? groupTotals : sumRows(shown);
  const shownStore =
    totals === groupTotals || storeFromWoo ? store : googleStoreTotals(totals);
  return (
    <ReportSection
      title={title}
      mark={icon}
      description={isTraffic ? GOOGLE_TRAFFIC_NOTE : undefined}
      actions={
        <ShowOffRowsToggle
          level="campaign"
          checked={showOff}
          onCheckedChange={setShowOff}
        />
      }
    >
      <ReportTable
        head={
          <GoogleAdsHeadCells
            goal={goal}
            showLeads={showLeads}
            compared={compared}
          />
        }
        foot={
          <GoogleAdsCampaignTotalsRow
            goal={goal}
            showLeads={showLeads}
            groupTotals={totals}
            store={shownStore}
            compared={compared}
            previous={previous?.totals}
            storeFromWoo={storeFromWoo}
            {...formats}
          />
        }
      >
        {shown.map((row, i) => (
          <ReportTr key={`${row.campaign_id || row.name}-${i}`}>
            <ReportNameCell name={row.name} on={!row.off} />
            <GoogleAdsCampaignCells
              row={row}
              goal={goal}
              showLeads={showLeads}
              compared={compared}
              previous={
                previous
                  ? (previous.byKey.get(googleCampaignKey(row)) ?? null)
                  : undefined
              }
              {...formats}
            />
          </ReportTr>
        ))}
      </ReportTable>
    </ReportSection>
  );
}

const SINGLE_TITLE = "סיכום קמפיינים - Google Ads";

/** Each goal's table title when the report shows more than one goal. */
const GOAL_TITLES: Record<GoogleReportGoal, string> = {
  ecommerce: `${CAMPAIGN_GOAL_TITLES.ecommerce} - Google Ads`,
  leads: `${CAMPAIGN_GOAL_TITLES.leads} - Google Ads`,
  traffic: `${CAMPAIGN_GOAL_TITLES.traffic} - Google Ads`,
};

/** Why an exposure table has no result columns. */
const GOOGLE_TRAFFIC_NOTE =
  "קמפיין שמשלם על חשיפות או קליקים — נמדד בהוצאה, בחשיפות ובקליקים בלבד";

/** The totals of the rows shown. */
function sumRows(rows: Array<GoogleAdsCampaignSummaryRow>): GoogleAdsTotals {
  const totals = emptyTotals();
  rows.forEach((row) => addTotals(totals, row));
  return totals;
}
