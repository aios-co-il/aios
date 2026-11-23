import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { FacebookGoalTable } from "@/components/FacebookReportTab/FacebookGoalTable";
import {
  leadsColumns,
  salesColumns,
  trafficColumns,
  type FacebookTabFormatters,
} from "@/components/FacebookReportTab/facebookColumns";
import { ContinentSummaryTable } from "./ContinentSummaryTable";
import {
  continentAnchor,
  type FacebookContinentsInput,
} from "./continentInputs";
import {
  FACEBOOK_SUMMARY_HEADERS,
  facebookContinentSections,
  facebookSummaryCells,
  type FacebookContinentSection,
} from "./facebookContinentSections";
import { useFacebookOnOf } from "./useFacebookOnOf";

/**
 * The Meta side of "לפי יבשות": a summary row per continent, then each
 * continent's campaigns in the Facebook tab's goal tables.
 */
export function FacebookContinentsTab({
  campaigns,
  records,
  tables,
  ...formats
}: FacebookContinentsInput) {
  const sections = useMemo(
    () => facebookContinentSections(campaigns),
    [campaigns],
  );
  const onOf = useFacebookOnOf(records, tables);
  if (sections.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">
          אין נתוני Facebook בטווח התאריכים הנבחר
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <ContinentSummaryTable
        rows={sections.map((section) => ({
          continent: section.continent,
          title: section.title,
          cells: facebookSummaryCells(section, formats),
        }))}
        headers={FACEBOOK_SUMMARY_HEADERS}
      />
      {sections.map((section) => (
        <div
          key={section.continent}
          id={continentAnchor(section.continent)}
          className="space-y-4"
        >
          <FacebookContinentTables section={section} onOf={onOf} {...formats} />
        </div>
      ))}
    </div>
  );
}

/** One continent's Meta campaigns: a table per goal that has campaigns. */
export function FacebookContinentTables({
  section,
  onOf,
  ...formats
}: FacebookTabFormatters & {
  section: FacebookContinentSection;
  onOf: (name: string) => boolean;
}) {
  const { ecommerce, leads, traffic } = section.campaigns;
  return (
    <>
      {ecommerce.length > 0 && (
        <FacebookGoalTable
          title={`${section.title} - Facebook מכירות`}
          campaigns={ecommerce}
          columns={salesColumns(ecommerce, formats)}
          onOf={onOf}
          withTotal
        />
      )}
      {leads.length > 0 && (
        <FacebookGoalTable
          title={`${section.title} - Facebook לידים`}
          campaigns={leads}
          columns={leadsColumns(formats)}
          onOf={onOf}
          withTotal
        />
      )}
      {traffic.length > 0 && (
        <FacebookGoalTable
          title={`${section.title} - Facebook תנועה`}
          campaigns={traffic}
          columns={trafficColumns(traffic, formats)}
          onOf={onOf}
          withTotal
        />
      )}
    </>
  );
}
