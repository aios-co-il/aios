import { useMemo, useState } from "react";
import { parseTrackedRatio, purchaseRevenue, ratioFigures } from "./siteKpis";
import { TrackedEventsEditor } from "./TrackedEventsEditor";
import { TrackedEventsTab } from "./TrackedEventsTab";
import {
  availableEventNames,
  parseTrackedEvents,
  summarizeTrackedEvents,
  type TrackedEventRecord,
} from "./trackedEvents";
import { type EventUsersSource, useEventUsers } from "./useEventUsers";
import { useSaveTrackedEvents } from "./useSaveTrackedEvents";

type Props = {
  /** The dashboard's records for the period, GA rows included. */
  records: Array<TrackedEventRecord>;
  /** The dashboard's settings, which hold `tracked_events`. */
  settings: unknown;
  /** Ads spend of the period, for the cost per event. */
  adsSpend: number;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  /** Which dashboard GA's people counts are read for. */
  source: EventUsersSource | null;
  /** The dashboard's date filter, and its custom range when "custom". */
  dateFilter: string;
  customFrom?: string;
  customTo?: string;
  /** Set on the internal dashboard, where the events can be edited. */
  editableDashboardId?: string;
};

/** The "אירועים באתר" tab of a dashboard, with its event picker when editable. */
export function DashboardTrackedEvents({
  records,
  settings,
  adsSpend,
  formatCurrency,
  formatNumber,
  source,
  dateFilter,
  customFrom,
  customTo,
  editableDashboardId,
}: Props) {
  const [editing, setEditing] = useState(false);
  const save = useSaveTrackedEvents(editableDashboardId);
  const tracked = useMemo(() => parseTrackedEvents(settings), [settings]);
  const summary = useMemo(
    () => summarizeTrackedEvents(records, tracked, adsSpend),
    [records, tracked, adsSpend],
  );
  const available = useMemo(() => availableEventNames(records), [records]);
  const revenue = useMemo(() => purchaseRevenue(records), [records]);
  const pair = useMemo(
    () => parseTrackedRatio(settings, tracked),
    [settings, tracked],
  );
  const users = useEventUsers({
    source,
    tracked,
    dateFilter,
    customFrom,
    customTo,
  });
  const ratio = pair
    ? ratioFigures(
        pair,
        tracked,
        Object.fromEntries(summary.events.map((e) => [e.event, e.count])),
        users.data?.total.users,
      )
    : null;
  return (
    <>
      <TrackedEventsTab
        summary={summary}
        revenue={revenue}
        ratio={ratio}
        eventUsers={{
          result: users.data,
          loading: users.isLoading,
          failed: users.isError,
        }}
        formatCurrency={formatCurrency}
        formatNumber={formatNumber}
        onEdit={editableDashboardId ? () => setEditing(true) : undefined}
      />
      {editing && (
        <TrackedEventsEditor
          open
          onOpenChange={setEditing}
          current={tracked}
          available={available}
          currentRatio={pair}
          onSave={(events, nextRatio) =>
            save.mutateAsync({ events, ratio: nextRatio })
          }
          saving={save.isPending}
        />
      )}
    </>
  );
}
