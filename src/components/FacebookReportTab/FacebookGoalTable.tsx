import { Fragment, type ReactNode, useState } from "react";
import { Facebook } from "lucide-react";
import { ReportSection } from "@/components/report-ui/ReportSection";
import { previousCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import {
  REPORT_CELL,
  ReportNameCell,
  ReportTable,
  ReportTd,
  ReportTh,
  ReportTr,
} from "@/components/report-ui/ReportTable";
import { ShowOffRowsToggle } from "@/components/report-ui/ShowOffRowsToggle";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";

/**
 * A column of a Facebook goal table. It reads a list of campaigns: one for a
 * campaign's row, all the rows shown for the total row.
 */
export type FacebookColumn = {
  label: string;
  value: (rows: Array<FacebookCampaignRow>) => ReactNode;
  /** A class for the cell, e.g. the accent for a result above zero. */
  tone?: (rows: Array<FacebookCampaignRow>) => string | undefined;
  /** How the previous-period column reads this metric; none when not compared. */
  compare?: {
    metric: (rows: Array<FacebookCampaignRow>) => number | null;
    format: (value: number) => string;
    direction: "higher" | "lower" | "neutral";
  };
};

/** One goal table's previous period, for its comparison columns. */
export type FacebookGoalPrevious = {
  /** Each campaign's previous row, by name, whatever table it sat in then. */
  byName: Map<string, FacebookCampaignRow>;
  /** The previous period's campaigns of this table, for its total row. */
  campaigns: Array<FacebookCampaignRow>;
};

type Props = {
  title: string;
  campaigns: Array<FacebookCampaignRow>;
  columns: Array<FacebookColumn>;
  /** Whether each campaign is on, by name (facebookCampaignOnOf). */
  onOf: (name: string) => boolean;
  /** Adds a total row over the campaigns shown. */
  withTotal?: boolean;
  /** The previous period; its columns show while it is set. */
  previous?: FacebookGoalPrevious | null;
};

/**
 * One goal's Facebook campaigns in the report design: the goal's columns, the
 * campaign's on/off switch and a filter for the switched-off ones.
 */
export function FacebookGoalTable({
  title,
  campaigns,
  columns,
  onOf,
  withTotal = false,
  previous,
}: Props) {
  const [showOff, setShowOff] = useState(true);
  const rows = showOff
    ? campaigns
    : campaigns.filter((campaign) => onOf(campaign.name));
  return (
    <ReportSection
      title={title}
      mark={<Facebook className="h-5 w-5 text-muted-foreground" />}
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
          <>
            <ReportTh>קמפיין</ReportTh>
            {columns.map((column) => (
              <Fragment key={column.label}>
                <ReportTh>{column.label}</ReportTh>
                {previous && column.compare && (
                  <PreviousValueHead cellClassName={REPORT_CELL} />
                )}
              </Fragment>
            ))}
          </>
        }
        foot={
          withTotal ? (
            <>
              <ReportTd>סה״כ</ReportTd>
              <Cells
                columns={columns}
                rows={rows}
                previous={previous ? previous.campaigns : undefined}
              />
            </>
          ) : undefined
        }
      >
        {rows.map((campaign) => (
          <ReportTr key={campaign.name}>
            <ReportNameCell name={campaign.name} on={onOf(campaign.name)} />
            <Cells
              columns={columns}
              rows={[campaign]}
              previous={previousRowOf(previous, campaign.name)}
            />
          </ReportTr>
        ))}
      </ReportTable>
    </ReportSection>
  );
}

/**
 * A cell per column over the given campaigns, each compared column followed
 * by its previous value. `previous` is null when the campaign did not run
 * then, undefined while the comparison is off.
 */
function Cells({
  columns,
  rows,
  previous,
}: {
  columns: Array<FacebookColumn>;
  rows: Array<FacebookCampaignRow>;
  previous: Array<FacebookCampaignRow> | null | undefined;
}) {
  const prev = previousCellsFor(rows, previous, REPORT_CELL);
  return columns.map((column) => (
    <Fragment key={column.label}>
      <ReportTd className={column.tone?.(rows)}>{column.value(rows)}</ReportTd>
      {column.compare &&
        prev(
          column.compare.metric,
          column.compare.format,
          column.compare.direction,
        )}
    </Fragment>
  ));
}

/** A campaign's previous row, null when it did not run then. */
function previousRowOf(
  previous: FacebookGoalPrevious | null | undefined,
  name: string,
): Array<FacebookCampaignRow> | null | undefined {
  if (!previous) {
    return undefined;
  }
  const row = previous.byName.get(name);
  return row ? [row] : null;
}
