import { ManualROICard } from "@/components/dynamic-tables/ManualROICard";
import type { AdsReportTable, ManualRoiOptions } from "./adsGoalTablesTypes";

type Props = {
  table: AdsReportTable;
  figures: { spend: number; leads: number };
  currency: string;
  options: ManualRoiOptions;
};

/** The report's manual ROI card, filled with the closures and revenue saved on the table. */
export function ReportManualRoi({ table, figures, currency, options }: Props) {
  const saved = savedManualRoi(table.integration_settings);
  return (
    <ManualROICard
      tableId={table.id}
      spend={figures.spend}
      leads={figures.leads}
      currency={currency}
      initialClosures={saved.closures}
      initialRevenue={saved.revenue}
      integrationSettings={table.integration_settings}
      readOnly={options.readOnly}
      saveFn={options.saveFn}
    />
  );
}

/** The manual ROI figures stored in the table's settings, null where none was entered. */
function savedManualRoi(settings: Record<string, unknown> | null | undefined): {
  closures: number | null;
  revenue: number | null;
} {
  const manualRoi = settings?.manual_roi;
  if (!manualRoi || typeof manualRoi !== "object") {
    return { closures: null, revenue: null };
  }
  return {
    closures: numberOrNull("closures" in manualRoi ? manualRoi.closures : null),
    revenue: numberOrNull("revenue" in manualRoi ? manualRoi.revenue : null),
  };
}

/** A stored figure as a number; anything else counts as not entered. */
function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  // Older rows may hold the figure as text.
  const parsed =
    typeof value === "string" && value !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
