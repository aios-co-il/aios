import { hasManualRoiData } from "@/lib/manualRoi";

type Figures = { spend: number; leads: number };

/**
 * Spend and leads behind the shared report's manual ROI card, or null to hide
 * it. Only lead campaigns count, so a lead campaign with no spend never takes
 * the sales campaigns' spend. With none in the range, the card still shows the
 * closures and revenue someone entered, against no lead spend.
 */
export function sharedManualRoiFigures(input: {
  leadRows: Figures[];
  summary: Figures & { hasLeads: boolean };
  integrationSettings?: Record<string, unknown> | null;
}): Figures | null {
  const { leadRows, summary } = input;
  if (leadRows.length > 0) {
    return { spend: sumOf(leadRows, "spend"), leads: sumOf(leadRows, "leads") };
  }
  if (summary.hasLeads) {
    return { spend: summary.spend, leads: summary.leads };
  }
  return hasManualRoiData(input.integrationSettings)
    ? { spend: 0, leads: 0 }
    : null;
}

/** One figure summed over the lead campaigns. */
function sumOf(rows: Figures[], key: keyof Figures): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
