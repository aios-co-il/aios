import { skipToken, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  isReconciledIntegration,
  pickTrustRun,
  reportDataTrust,
} from "./dataTrust";

interface ReportDataTrustProps {
  tableId?: string | null;
  integrationType?: string | null;
  className?: string;
}

/** "Matches the platform ✓" / "gaps found" from the latest nightly reconciliation. */
export function ReportDataTrust({
  tableId,
  integrationType,
  className,
}: ReportDataTrustProps) {
  const reconciled = isReconciledIntegration(integrationType);
  const { data: run } = useQuery({
    queryKey: ["report-data-trust", tableId],
    staleTime: 10 * 60 * 1000,
    queryFn: tableId && reconciled ? () => fetchTrustRun(tableId) : skipToken,
  });

  const trust = tableId && reconciled ? reportDataTrust(run) : null;
  if (!trust) {
    return null;
  }

  return (
    <p
      role="status"
      title={trust.title}
      className={cn(
        "text-xs flex items-center gap-1",
        trust.tone === "ok"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      {trust.tone === "gaps" && <AlertTriangle className="h-3 w-3 shrink-0" />}
      {trust.label}
    </p>
  );
}

/** The run the line describes, from the table's recent runs (RLS limits them to readers of the table). */
async function fetchTrustRun(tableId: string) {
  const { data, error } = await supabase
    .from("reconcile_runs")
    .select(
      "status, started_at, finished_at, window_start, window_end, platform, summary",
    )
    .eq("table_id", tableId)
    .order("started_at", { ascending: false })
    // A few runs, so one a rate limit stopped does not hide the result before it.
    .limit(10);
  if (error) {
    throw error;
  }
  return pickTrustRun(data);
}
