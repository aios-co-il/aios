import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getJerusalemDashboardDateRange } from "@/lib/calendarTimeZone";
import type { EventUsersResult } from "../../../../supabase/functions/ga-event-users/reports.ts";
import type { TrackedEvent } from "./trackedEvents";

/** Which dashboard to read: by id when signed in, or through its share link. */
export type EventUsersSource = { dashboardId: string } | { shareToken: string };

/**
 * People per followed event, by source and in total, with step conversion,
 * read live from GA through the ga-event-users function for the dashboard's
 * selected dates.
 */
export function useEventUsers(input: {
  source: EventUsersSource | null;
  tracked: Array<TrackedEvent>;
  dateFilter: string;
  customFrom?: string;
  customTo?: string;
}) {
  const { source, tracked, dateFilter, customFrom, customTo } = input;
  const { startDate, endDate } = getJerusalemDashboardDateRange(
    dateFilter,
    new Date(),
    customFrom,
    customTo,
  );
  const ready =
    source !== null &&
    tracked.length > 0 &&
    (dateFilter !== "custom" || (!!customFrom && !!customTo));
  return useQuery({
    queryKey: [
      "ga-event-users",
      source,
      tracked.map((step) => step.event).join(","),
      dateFilter,
      startDate,
      endDate,
    ],
    queryFn: ready
      ? async (): Promise<EventUsersResult> => {
          const { data, error } = await supabase.functions.invoke(
            "ga-event-users",
            {
              body: {
                // A share link sends its filter so the server picks the same
                // dates as the link's other reports.
                ...("dashboardId" in source
                  ? {
                      dashboard_id: source.dashboardId,
                      start_date: startDate ?? undefined,
                      end_date: endDate ?? undefined,
                    }
                  : {
                      share_token: source.shareToken,
                      date_filter: dateFilter,
                    }),
              },
            },
          );
          if (error) {
            throw error;
          }
          return data as EventUsersResult;
        }
      : skipToken,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
}
