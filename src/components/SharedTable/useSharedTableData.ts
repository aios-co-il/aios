import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  fetchPublicTable,
  sharedTableKey,
  type SharedTablePayload,
} from "./publicTableApi";

/** The report window the viewer picked. */
export type SharedDateSelection = {
  filter: string;
  customStart?: Date;
  customEnd?: Date;
};

/**
 * The share link's report for the picked window. SEO shares ignore the window
 * and load fast first, with Search Console following in a second request.
 */
export function useSharedTableData(
  shareToken: string,
  dates: SharedDateSelection,
) {
  const [seoShareLocked, setSeoShareLocked] = useState(false);
  const customReady = !!dates.customStart && !!dates.customEnd;
  const windowQuery = seoShareLocked ? null : windowParams(dates);

  const core = useQuery({
    queryKey: [
      ...sharedTableKey(shareToken),
      windowQuery ? Object.values(windowQuery).join("|") : "seo",
      "core",
    ],
    // SEO share links ignore date_filter server-side, so it is not sent:
    // toggling the ads date chips would refetch for nothing.
    queryFn: () =>
      fetchPublicTable(shareToken, { ...windowQuery, seo_part: "core" }),
    enabled: seoShareLocked || dates.filter !== "custom" || customReady,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isSeoShare = core.data?.table?.integration_type === "ahrefs";
  const gsc = useQuery({
    queryKey: [...sharedTableKey(shareToken), "gsc"],
    queryFn: () => fetchPublicTable(shareToken, { seo_part: "gsc" }),
    enabled: isSeoShare,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (isSeoShare) {
      setSeoShareLocked(true);
    }
  }, [isSeoShare]);

  const data = useMemo(
    () => withSearchConsole(core.data, isSeoShare ? gsc.data : undefined),
    [core.data, gsc.data, isSeoShare],
  );

  return {
    data,
    isLoading: core.isLoading,
    isFetching: core.isFetching,
    error: core.error,
    gscLoading: gsc.isLoading,
    isSeoShare,
  };
}

/** The date query of an ads or analytics share. */
function windowParams(dates: SharedDateSelection): Record<string, string> {
  if (dates.filter === "custom" && dates.customStart && dates.customEnd) {
    return {
      date_filter: "custom",
      custom_start: format(dates.customStart, "yyyy-MM-dd"),
      custom_end: format(dates.customEnd, "yyyy-MM-dd"),
    };
  }
  return { date_filter: dates.filter };
}

/** The core answer with the Search Console part once it arrives. */
function withSearchConsole(
  core: SharedTablePayload | undefined,
  gsc: SharedTablePayload | undefined,
): SharedTablePayload | undefined {
  if (!core || !core.table || core.table.integration_type !== "ahrefs") {
    return core;
  }
  return {
    ...core,
    gsc_records: gsc?.gsc_records ?? core.gsc_records ?? [],
    gsc_multi_period: gsc?.gsc_multi_period ?? core.gsc_multi_period ?? null,
    gsc_synced_at: gsc?.gsc_synced_at ?? core.gsc_synced_at ?? null,
  };
}
