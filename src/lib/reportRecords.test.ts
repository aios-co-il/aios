import { expect, test } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  reportRecordsQuery,
  reportRecordsQueryOptions,
  type CrmRecord,
} from "./reportRecords.ts";
import { refetchOnMountIfEmpty } from "./reportQueryOptions.ts";
test("concurrent combined/table views share one authorised request", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls++;
        return { data: [{ id: "row", data: {} }], error: null };
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
      invoke: async () => ({
        data: [{ id: "row", data: { revision: ++calls } }],
        error: null,
      }),
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
  cache.setQueryData(query.queryKey, [{ id: "row", data: { revision: 1 } }], {
    updatedAt: Date.now() - 6 * 60 * 1000,
  });
  const stale = new QueryObserver(cache, query);
  const stopStale = stale.subscribe(() => {});
  expect(stale.getCurrentResult().data).toStrictEqual([
    { id: "row", data: { revision: 1 } },
  ]);
  expect(stale.getCurrentResult().isFetching).toBe(true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls).toBe(2);
  expect(stale.getCurrentResult().data).toStrictEqual([
    { id: "row", data: { revision: 2 } },
  ]);
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
      invoke: async () => ({
        data: [{ id: "row", data: { revision: ++calls } }],
        error: null,
      }),
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
  expect(refreshed[0].data.revision).toBe(2);
  cache.clear();
});

test("view options deduplicate matching windows and separate selected, weekly, and custom windows", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => ({
        data: [{ id: String(++calls), data: {} }],
        error: null,
      }),
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    const selected = reportRecordsQueryOptions(
      client,
      "table-a",
      "last_30_days",
    );
    const weekly = reportRecordsQueryOptions(
      client,
      "table-a",
      "last_365_days",
    );
    const matchingWeekly = reportRecordsQueryOptions(
      client,
      "table-a",
      "last_365_days",
      "ignored",
      "ignored",
    );
    const custom = reportRecordsQueryOptions(
      client,
      "table-a",
      "custom",
      "2026-09-01",
      "2026-09-10",
    );
    const otherCustom = reportRecordsQueryOptions(
      client,
      "table-a",
      "custom",
      "2026-09-02",
      "2026-09-10",
    );
    const [a, b, c, d, e] = await Promise.all(
      [selected, weekly, matchingWeekly, custom, otherCustom].map((query) =>
        cache.fetchQuery(query),
      ),
    );
    expect(calls).toBe(4);
    expect(b).toBe(c);
    expect(a).not.toStrictEqual(b);
    expect(d).not.toStrictEqual(e);
  } finally {
    cache.clear();
  }
});

test("disabled weekly observer does not request records until enabled", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => ({
        data: [{ id: String(++calls), data: {} }],
        error: null,
      }),
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const options = reportRecordsQueryOptions(client, "table-a", "last_365_days");
  const observer = new QueryObserver<CrmRecord[]>(cache, {
    ...options,
    enabled: false,
  });
  const stop = observer.subscribe(() => {});
  try {
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toBe(0);
    observer.setOptions({ ...options, enabled: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toBe(1);
  } finally {
    stop();
    cache.clear();
  }
});

test("rejects rows that do not match the record shape", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  for (const data of [[{ id: "row" }], [{ id: 1, data: {} }], [null], {}]) {
    const client = {
      functions: { invoke: async () => ({ data, error: null }) },
    };
    await expect(
      cache.fetchQuery(
        reportRecordsQuery(client, `table-${JSON.stringify(data)}`, "all"),
      ),
    ).rejects.toThrow("Invalid report response");
  }
  cache.clear();
});
