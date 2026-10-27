import { hasManualRoiData } from "@/components/dynamic-tables/manualRoi";

type Figures = { spend: number; leads: number };

/**
 * Spend and leads behind the shared report's manual ROI card, or null to hide
 * it. Only lead campaigns count. With none in the range, the card still shows
 * the closures and revenue someone entered, against no lead spend.
 */
export function sharedManualRoiFigures(input: {
  leadRows: Figures[];
  summary: Figures & { hasLeads: boolean };
  integrationSettings?: Record<string, unknown> | null;
}): Figures | null {
  const { leadRows, summary } = input;
  if (summary.hasLeads || leadRows.length > 0) {
    const sum = (key: keyof Figures) =>
      leadRows.reduce((total, row) => total + row[key], 0);
    return {
      spend: sum("spend") || summary.spend,
      leads: sum("leads") || summary.leads,
    };
  }
  return hasManualRoiData(input.integrationSettings)
    ? { spend: 0, leads: 0 }
    : null;
}
