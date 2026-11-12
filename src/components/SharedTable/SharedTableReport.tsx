import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SharedDataReport } from "./SharedDataReport";
import { SharedSeoReport } from "./SharedSeoReport";
import {
  type SharedDateSelection,
  useSharedTableData,
} from "./useSharedTableData";

type Props = {
  shareToken: string;
  /** The window the report opens on; the viewer can change it. */
  initialDateFilter?: string;
  /** The window, when the host holds it: the client card's live view and its send capture. */
  dates?: SharedDateSelection;
  onDatesChange?: (dates: SharedDateSelection) => void;
  /**
   * The summary the client card photographs on send: no controls, and a
   * `data-snapshot-end` marker after the summary tables.
   */
  summaryOnly?: boolean;
};

/**
 * A single report as its share link shows it, with the internal report's
 * tables. It takes the token as a prop so the client card can embed it too.
 */
export function SharedTableReport({
  shareToken,
  initialDateFilter = "last_7_days",
  dates: hostDates,
  onDatesChange,
  summaryOnly = false,
}: Props) {
  const [ownDates, setOwnDates] = useState<SharedDateSelection>({
    filter: initialDateFilter,
  });
  const dates = hostDates ?? ownDates;
  const setDates = onDatesChange ?? setOwnDates;
  const { data, isLoading, isFetching, error, gscLoading } = useSharedTableData(
    shareToken,
    dates,
  );

  if (isLoading) {
    return <LoadingReport />;
  }
  if (error || data?.error) {
    return <InvalidLink detail={error instanceof Error ? error.message : ""} />;
  }
  if (!data?.table) {
    return null;
  }
  if (data.table.integration_type === "ahrefs") {
    return (
      <SharedSeoReport
        data={data}
        table={data.table}
        gscLoading={gscLoading}
        ready={!isFetching && !gscLoading}
        summaryOnly={summaryOnly}
      />
    );
  }
  return (
    <SharedDataReport
      shareToken={shareToken}
      data={data}
      table={data.table}
      dates={dates}
      onDatesChange={setDates}
      ready={!isFetching}
      summaryOnly={summaryOnly}
    />
  );
}

/** Placeholder while the report loads. */
function LoadingReport() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center"
      dir="rtl"
    >
      <div className="w-full max-w-6xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

/** Said when the link is unknown or switched off; a send capture stops on it. */
function InvalidLink({ detail }: { detail: string }) {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center"
      dir="rtl"
      data-snapshot-error={detail || "load_failed"}
    >
      <Card className="w-full max-w-md mx-4">
        <CardContent className="py-12 text-center">
          <p className="text-lg font-semibold mb-2">הקישור אינו תקין</p>
          <p className="text-sm text-muted-foreground">
            קישור השיתוף לא נמצא או שאינו פעיל יותר.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
