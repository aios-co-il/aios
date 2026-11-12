import { skipToken, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { previousPeriodRange } from "@/components/reports/PreviousPeriod/previousPeriod";
import {
  fetchPublicTable,
  sharedTableKey,
  type SharedTableRecord,
} from "./publicTableApi";
import type { SharedDateSelection } from "./useSharedTableData";

/**
 * The share link's records for the window right before the one shown, read
 * from public-table as a custom range only while the comparison is on. Null
 * range when the window has no "before" (all history, an unfinished custom
 * range).
 */
export function useSharedPreviousPeriod(
  shareToken: string,
  dates: SharedDateSelection,
  enabled: boolean,
) {
  const range = previousPeriodRange(
    dates.filter,
    dates.customStart ? format(dates.customStart, "yyyy-MM-dd") : null,
    dates.customEnd ? format(dates.customEnd, "yyyy-MM-dd") : null,
  );
  const query = useQuery({
    queryKey: [
      ...sharedTableKey(shareToken),
      "previous",
      range?.startDate,
      range?.endDate,
    ],
    queryFn:
      enabled && range
        ? () =>
            fetchPublicTable(shareToken, {
              date_filter: "custom",
              custom_start: range.startDate,
              custom_end: range.endDate,
              seo_part: "core",
            })
        : skipToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Rows kept from another window while a new one loads are never compared.
  const loading = query.isPending || query.isPlaceholderData;
  const ready = enabled && !!range && !loading && !query.isError;
  const records: Array<SharedTableRecord> | undefined = ready
    ? (query.data?.records ?? [])
    : undefined;
  return {
    range,
    records,
    isPending: enabled && !!range && loading,
    failed: enabled && query.isError,
  };
}
