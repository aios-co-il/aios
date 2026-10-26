import { expect, test } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { reportRecordsQuery } from "./reportRecords.ts";
import { refetchOnMountIfEmpty } from "./reportQueryOptions.ts";
test("concurrent combined/table views share one authorised request", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls++;
        return { data: [{ id: "row" }], error: null };
      },
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const query = reportRecordsQuery(client, "table-a", "last_30_days");
  const result = await Promise.all([
    cache.fetchQuery(query),
    cache.fetchQuery(query),
  ]);
  expect(calls).toBe(1);
  expect(result[0]).toStrictEqual(result[1]);
  cache.clear();
});
test("date windows remain separate and cancellation is forwarded", async () => {
  const signal = new AbortController().signal;
  const client = {
    functions: {
      invoke: async (path, opts) => {
        expect(path).toMatch(/date_from=2026-09-01/);
        expect(opts.signal).toBe(signal);
        return { data: [], error: null };
      },
    },
  };
  const a = reportRecordsQuery(
    client,
    "table-a",
    "custom",
    "2026-09-01",
    "2026-09-10",
  );
  const b = reportRecordsQuery(
    client,
    "table-b",
    "custom",
    "2026-09-01",
    "2026-09-10",
  );
  expect(a.queryKey).not.toStrictEqual(b.queryKey);
  expect(
    reportRecordsQuery(client, "table-a", "today", "", "").queryKey,
  ).toStrictEqual(
    reportRecordsQuery(client, "table-a", "today", "2026-09-01", "2026-09-10")
      .queryKey,
  );
  await a.queryFn({ signal });
});
test("fresh reports avoid a request; stale reports refresh without clearing visible rows", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => ({ data: [{ revision: ++calls }], error: null }),
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const query = {
    ...reportRecordsQuery(client, "table-a", "today"),
    refetchOnMount: refetchOnMountIfEmpty,
  };
  await cache.fetchQuery(query);
  const warm = new QueryObserver(cache, query);
  const stopWarm = warm.subscribe(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls).toBe(1);
  stopWarm();
  cache.setQueryData(query.queryKey, [{ revision: 1 }], {
    updatedAt: Date.now() - 6 * 60 * 1000,
  });
  const stale = new QueryObserver(cache, query);
  const stopStale = stale.subscribe(() => {});
  expect(stale.getCurrentResult().data).toStrictEqual([{ revision: 1 }]);
  expect(stale.getCurrentResult().isFetching).toBe(true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls).toBe(2);
  expect(stale.getCurrentResult().data).toStrictEqual([{ revision: 2 }]);
  stopStale();
  cache.clear();
});
test("access errors cannot become an empty successful report", async () => {
  const client = {
    functions: {
      invoke: async () => ({ data: null, error: new Error("Forbidden") }),
    },
  };
  await expect(
    reportRecordsQuery(client, "a", "today").queryFn({
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow(/Forbidden/);
});
test("navigation reuses fresh records and an explicit refresh fetches new data", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => ({ data: [{ revision: ++calls }], error: null }),
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const query = reportRecordsQuery(client, "table-a", "last_7_days");
  await cache.fetchQuery(query);
  await cache.fetchQuery(query);
  expect(calls).toBe(1);
  await cache.invalidateQueries({
    queryKey: ["crm-records", "table-a"],
    refetchType: "none",
  });
  const refreshed = await cache.fetchQuery(query);
  expect(calls).toBe(2);
  expect(refreshed[0].revision).toBe(2);
  cache.clear();
});
