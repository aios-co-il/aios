import { REPORT_QUERY_STALE_MS, reportQueryOptions } from './reportQueryOptions.ts';

export interface CrmRecord {
  id: string;
  data: Record<string, any>;
}

type ReportClient = {
  functions: {
    invoke: (path: string, options: { method: 'GET'; signal: AbortSignal }) => Promise<{ data: unknown; error: unknown }>;
  };
};

/** One cache entry per table/date window, shared by table and combined reports. */
export function reportRecordsQuery(
  client: ReportClient,
  tableId: string,
  dateFilter: string,
  dateFrom?: string | null,
  dateTo?: string | null,
) {
  const from = dateFilter === 'custom' ? dateFrom ?? null : null;
  const to = dateFilter === 'custom' ? dateTo ?? null : null;
  return {
    queryKey: ['crm-records', tableId, dateFilter, from, to],
    staleTime: REPORT_QUERY_STALE_MS,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({ table_id: tableId, date_filter: dateFilter });
      if (dateFilter === 'custom' && dateFrom && dateTo) {
        params.set('date_from', dateFrom);
        params.set('date_to', dateTo);
      }
      // The Edge endpoint still authenticates and checks table access on every
      // request. Do not turn a failed permission/network request into cached [].
      const response = await client.functions.invoke(`crm-records?${params}`, { method: 'GET', signal });
      if (response.error) throw response.error;
      if (!Array.isArray(response.data)) throw new Error('Invalid report response');
      return response.data as CrmRecord[];
    },
  };
}

/** Typed options for report views, with the shared loading/cache policy. */
export function reportRecordsQueryOptions(...args: Parameters<typeof reportRecordsQuery>) {
  return {
    ...reportRecordsQuery(...args),
    ...reportQueryOptions<CrmRecord[]>(),
  };
}
