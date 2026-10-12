import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { reportRecordsQuery, reportRecordsQueryOptions, type CrmRecord } from './reportRecords.ts';
import { refetchOnMountIfEmpty } from './reportQueryOptions.ts';
test('concurrent combined/table views share one authorised request', async () => {
  let calls = 0;
  const client = { functions: { invoke: async () => { calls++; return { data: [{ id: 'row' }], error: null }; } } };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const query = reportRecordsQuery(client, 'table-a', 'last_30_days');
  const result = await Promise.all([cache.fetchQuery(query), cache.fetchQuery(query)]);
  assert.equal(calls, 1); assert.deepEqual(result[0], result[1]);
  cache.clear();
});
test('date windows remain separate and cancellation is forwarded', async () => {
  const signal = new AbortController().signal;
  const client = { functions: { invoke: async (path, opts) => {
    assert.match(path, /date_from=2026-09-01/); assert.equal(opts.signal, signal);
    return { data: [], error: null };
  } } };
  const a = reportRecordsQuery(client, 'table-a', 'custom', '2026-09-01', '2026-09-10');
  const b = reportRecordsQuery(client, 'table-b', 'custom', '2026-09-01', '2026-09-10');
  assert.notDeepEqual(a.queryKey, b.queryKey);
  assert.deepEqual(reportRecordsQuery(client, 'table-a', 'today', '', '').queryKey,
    reportRecordsQuery(client, 'table-a', 'today', '2026-09-01', '2026-09-10').queryKey);
  await a.queryFn({ signal });
});
test('fresh reports avoid a request; stale reports refresh without clearing visible rows', async () => {
  let calls = 0;
  const client = { functions: { invoke: async () => ({ data: [{ id: 'row', data: { revision: ++calls } }], error: null }) } };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const query = { ...reportRecordsQuery(client, 'table-a', 'today'), refetchOnMount: refetchOnMountIfEmpty };
  await cache.fetchQuery(query);
  const warm = new QueryObserver(cache, query);
  const stopWarm = warm.subscribe(() => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  stopWarm();
  cache.setQueryData(query.queryKey, [{ id: 'row', data: { revision: 1 } }], { updatedAt: Date.now() - 6 * 60 * 1000 });
  const stale = new QueryObserver(cache, query);
  const stopStale = stale.subscribe(() => {});
  assert.deepEqual(stale.getCurrentResult().data, [{ id: 'row', data: { revision: 1 } }]);
  assert.equal(stale.getCurrentResult().isFetching, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.deepEqual(stale.getCurrentResult().data, [{ id: 'row', data: { revision: 2 } }]);
  stopStale();
  cache.clear();
});
test('access errors cannot become an empty successful report', async () => {
  const client = { functions: { invoke: async () => ({ data: null, error: new Error('Forbidden') }) } };
  await assert.rejects(reportRecordsQuery(client, 'a', 'today').queryFn({ signal: new AbortController().signal }), /Forbidden/);
});
test('navigation reuses fresh records and an explicit refresh fetches new data', async () => {
  let calls = 0;
  const client = { functions: { invoke: async () => ({ data: [{ id: 'row', data: { revision: ++calls } }], error: null }) } };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const query = reportRecordsQuery(client, 'table-a', 'last_7_days');
  await cache.fetchQuery(query);
  await cache.fetchQuery(query);
  assert.equal(calls, 1);
  await cache.invalidateQueries({ queryKey: ['crm-records', 'table-a'], refetchType: 'none' });
  const refreshed = await cache.fetchQuery(query);
  assert.equal(calls, 2);
  assert.equal(refreshed[0].data.revision, 2);
  cache.clear();
});

test('view options deduplicate matching windows and separate selected, weekly, and custom windows', async () => {
  let calls = 0;
  const client = { functions: { invoke: async () => ({ data: [{ id: String(++calls), data: {} }], error: null }) } };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const selected = reportRecordsQueryOptions(client, 'table-a', 'last_30_days');
    const weekly = reportRecordsQueryOptions(client, 'table-a', 'last_365_days');
    const matchingWeekly = reportRecordsQueryOptions(client, 'table-a', 'last_365_days', 'ignored', 'ignored');
    const custom = reportRecordsQueryOptions(client, 'table-a', 'custom', '2026-09-01', '2026-09-10');
    const otherCustom = reportRecordsQueryOptions(client, 'table-a', 'custom', '2026-09-02', '2026-09-10');
    const [a, b, c, d, e] = await Promise.all([selected, weekly, matchingWeekly, custom, otherCustom].map(query => cache.fetchQuery(query)));
    assert.equal(calls, 4);
    assert.strictEqual(b, c);
    assert.notDeepEqual(a, b);
    assert.notDeepEqual(d, e);
  } finally {
    cache.clear();
  }
});

test('disabled weekly observer does not request records until enabled', async () => {
  let calls = 0;
  const client = { functions: { invoke: async () => ({ data: [{ id: String(++calls), data: {} }], error: null }) } };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = reportRecordsQueryOptions(client, 'table-a', 'last_365_days');
  const observer = new QueryObserver<CrmRecord[]>(cache, { ...options, enabled: false });
  const stop = observer.subscribe(() => {});
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 0);
    observer.setOptions({ ...options, enabled: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  } finally {
    stop();
    cache.clear();
  }
});
