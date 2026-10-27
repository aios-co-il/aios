import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportDataFreshnessProps {
  lastSyncAt?: string | null;
  /** The latest sync did not refresh the data (see getReportSyncProblem). */
  syncProblem?: "failed" | "empty" | null;
  dataUpdatedAt?: number;
  isFetching?: boolean;
  className?: string;
}

const SYNC_PROBLEM_LABEL = {
  failed: "הסנכרון האחרון נכשל — הנתונים לא עודכנו",
  empty: "הסנכרון האחרון לא החזיר נתונים",
} as const;

function formatHebrewDateTime(value: string | number): string {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function ReportDataFreshness({
  lastSyncAt,
  syncProblem,
  dataUpdatedAt,
  isFetching,
  className,
}: ReportDataFreshnessProps) {
  const syncLabel = lastSyncAt ? formatHebrewDateTime(lastSyncAt) : null;
  const loadedLabel = dataUpdatedAt
    ? formatHebrewDateTime(dataUpdatedAt)
    : null;

  if (!syncLabel && !loadedLabel && !isFetching && !syncProblem) return null;

  return (
    <p
      className={cn(
        "text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5",
        className,
      )}
    >
      {isFetching && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      {syncLabel && <span>עדכון מקור: {syncLabel}</span>}
      {syncProblem && (
        <span
          role="status"
          className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {SYNC_PROBLEM_LABEL[syncProblem]}
        </span>
      )}
      {loadedLabel && (
        <span>
          {syncLabel ? "·" : ""}
          טעינה: {loadedLabel}
        </span>
      )}
      {isFetching && (
        <span>{syncLabel || loadedLabel ? "·" : ""} מעדכן ברקע...</span>
      )}
    </p>
  );
}
