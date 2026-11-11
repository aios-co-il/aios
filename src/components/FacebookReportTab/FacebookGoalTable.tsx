import type { ReactNode } from "react";
import { useState } from "react";
import { Facebook } from "lucide-react";
import { ReportSection } from "@/components/report-ui/ReportSection";
import {
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
};

type Props = {
  title: string;
  campaigns: Array<FacebookCampaignRow>;
  columns: Array<FacebookColumn>;
  /** Whether each campaign is on, by name (facebookCampaignOnOf). */
  onOf: (name: string) => boolean;
  /** Adds a total row over the campaigns shown. */
  withTotal?: boolean;
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
              <ReportTh key={column.label}>{column.label}</ReportTh>
            ))}
          </>
        }
        foot={
          withTotal ? (
            <>
              <ReportTd>סה״כ</ReportTd>
              <Cells columns={columns} rows={rows} />
            </>
          ) : undefined
        }
      >
        {rows.map((campaign) => (
          <ReportTr key={campaign.name}>
            <ReportNameCell name={campaign.name} on={onOf(campaign.name)} />
            <Cells columns={columns} rows={[campaign]} />
          </ReportTr>
        ))}
      </ReportTable>
    </ReportSection>
  );
}

/** A cell per column over the given campaigns. */
function Cells({
  columns,
  rows,
}: {
  columns: Array<FacebookColumn>;
  rows: Array<FacebookCampaignRow>;
}) {
  return columns.map((column) => (
    <ReportTd key={column.label} className={column.tone?.(rows)}>
      {column.value(rows)}
    </ReportTd>
  ));
}
