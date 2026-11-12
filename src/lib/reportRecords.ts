import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";
import {
  REPORT_QUERY_STALE_MS,
  reportQueryOptions,
} from "./reportQueryOptions.ts";

export type CrmRecord = Pick<Tables<"crm_records">, "id"> & {
  data: Record<string, unknown>;
};

const crmRecordsSchema = z.array(
  z.object({ id: z.string(), data: z.record(z.unknown()) }).passthrough(),
);

type ReportClient = {
  functions: {
    invoke: (
      path: string,
      options: { method: "GET"; signal: AbortSignal },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

/**
 * `campaign`: an ads table's rows the dashboards sum only, read so in the
 * query (crm-records `level`). Unset reads every level, as the single report
 * with its ad set and ad tabs needs.
 */
export type ReportRecordsLevel = "campaign";

/**
 * One cache entry per table/date window (and level), shared by table and
 * combined reports. A campaign-rows read keeps its own entry, so a report
 * never reads a dashboard's trimmed rows from the cache.
 */
export function reportRecordsQuery(
  client: ReportClient,
  tableId: string,
  dateFilter: string,
  dateFrom?: string | null,
  dateTo?: string | null,
  level?: ReportRecordsLevel,
) {
  const from = dateFilter === "custom" ? (dateFrom ?? null) : null;
  const to = dateFilter === "custom" ? (dateTo ?? null) : null;
  // Appended only when set: every-level keys stay as they were.
  const levelKey = level ? [level] : [];
  return {
    queryKey: ["crm-records", tableId, dateFilter, from, to, ...levelKey],
    staleTime: REPORT_QUERY_STALE_MS,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({
        table_id: tableId,
        date_filter: dateFilter,
      });
      if (dateFilter === "custom" && dateFrom && dateTo) {
        params.set("date_from", dateFrom);
        params.set("date_to", dateTo);
      }
      if (level) {
        params.set("level", level);
      }
      // The Edge endpoint still authenticates and checks table access on every
      // request. Do not turn a failed permission/network request into cached [].
      const response = await client.functions.invoke(`crm-records?${params}`, {
        method: "GET",
        signal,
      });
      if (response.error) throw response.error;
      const parsed = crmRecordsSchema.safeParse(response.data);
      if (!parsed.success) throw new Error("Invalid report response");
      return parsed.data satisfies CrmRecord[];
    },
  };
}

/** Typed options for report views, with the shared loading/cache policy. */
export function reportRecordsQueryOptions(
  client: ReportClient,
  tableId: string,
  dateFilter: string,
  dateFrom?: string | null,
  dateTo?: string | null,
) {
  return {
    ...reportRecordsQuery(client, tableId, dateFilter, dateFrom, dateTo),
    ...reportQueryOptions<CrmRecord[]>(),
  };
}
