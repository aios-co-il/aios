import { formatReportDate } from "@/lib/reportCoverage";
import type { AdsRangeSyncResult } from "./syncAdsTableRange";

/**
 * The toast text for a table whose sync stopped at a failed piece: the days
 * that failed, the edge's reason and how many pieces were kept.
 */
export function rangeSyncFailureMessage(result: AdsRangeSyncResult): string {
  if (!result.failure) {
    return "";
  }
  const { piece, message } = result.failure;
  const where = ` בימים ${formatReportDate(piece.startDate)}–${formatReportDate(piece.endDate)}`;
  const kept =
    result.piecesDone > 0
      ? ` (${result.piecesDone}/${result.piecesTotal} חלקים נשמרו)`
      : "";
  return `הסנכרון נכשל${where}: ${message}${kept}`;
}
