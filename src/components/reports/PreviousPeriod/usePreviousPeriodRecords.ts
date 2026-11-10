import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportRecordsQueryOptions } from "@/lib/reportRecords";
import { previousPeriodRange } from "./previousPeriod";

/**
 * The report table's records for the window right before the one shown, read
 * only while the comparison is on. Null range when the window has no
 * "before" (all history, or an unfinished custom range).
 */
export function usePreviousPeriodRecords({
  tableId,
  dateFilter,
  customFrom,
  customTo,
  enabled,
}: {
  tableId: string | undefined;
  dateFilter: string;
  customFrom: string | null;
  customTo: string | null;
  enabled: boolean;
}) {
  const range = previousPeriodRange(dateFilter, customFrom, customTo);
  const query = useQuery({
    ...reportRecordsQueryOptions(
      supabase,
      tableId ?? "",
      "custom",
      range?.startDate,
      range?.endDate,
    ),
    enabled: enabled && !!tableId && !!range,
  });
  return {
    range,
    records: enabled && range ? query.data : undefined,
    isPending: enabled && !!range && query.isPending,
  };
}
