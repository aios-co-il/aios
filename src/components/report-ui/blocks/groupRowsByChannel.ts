import type { ReportCampaignRow, ReportChannel } from "../data/reportData";
import {
  addAdsFigures,
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";

/** The order the platforms' campaigns are listed in. */
const CHANNEL_ORDER: Array<ReportChannel> = ["facebook", "google_ads"];

export type ChannelGroup<Row> = { channel: ReportChannel; rows: Array<Row> };

/**
 * Campaign rows split by platform, Meta first and then Google, each keeping
 * the order it came in, so a goal never mixes the platforms' campaigns
 * (David, 2026-11-11). Platforms without rows are left out.
 */
export function groupRowsByChannel<Row extends { channel: ReportChannel }>(
  rows: Array<Row>,
): Array<ChannelGroup<Row>> {
  return CHANNEL_ORDER.map((channel) => ({
    channel,
    rows: rows.filter((row) => row.channel === channel),
  })).filter((group) => group.rows.length > 0);
}

/** The rows' figures added up as the platforms report them. */
export function sumFigures(rows: Array<ReportCampaignRow>): ReportFigures {
  return rows.reduce(
    (sum, row) => addAdsFigures(sum, row.figures),
    emptyReportFigures(),
  );
}
