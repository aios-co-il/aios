/**
 * Meta answers a heavy insights read (many days × many ads at daily
 * breakdown) with code 1 "An unknown error occurred" or code 2 "Service
 * temporarily unavailable" after about 30 seconds. A new table's first sync
 * asks for 120 days at once, so a large account never synced (Eco field
 * trips, 2026-11-11). The read goes in date chunks instead, and a chunk Meta
 * cannot serve is split in two until it is a week long.
 */
const CHUNK_DAYS = 30;
const MIN_SPLIT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A date range, both ends included, as yyyy-MM-dd. */
export type DateRange = { since: string; until: string };

type GraphPage = {
  data?: Array<unknown>;
  error?: { message?: string; code?: number };
  paging?: { next?: string };
};

/** A Graph error the read reports, with Meta's code when it gave one. */
export class GraphReadError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
  ) {
    super(message);
  }
}

/** The range cut into consecutive chunks of at most `days` days. */
export function dateChunks(
  range: DateRange,
  days = CHUNK_DAYS,
): Array<DateRange> {
  const chunks: Array<DateRange> = [];
  const end = utcDay(range.until);
  for (let start = utcDay(range.since); start <= end; start += days * DAY_MS) {
    chunks.push({
      since: isoDay(start),
      until: isoDay(Math.min(start + (days - 1) * DAY_MS, end)),
    });
  }
  return chunks;
}

/** Meta's "too much at once" answers, which a smaller range can avoid. */
export function isMetaOverload(error: unknown): boolean {
  return (
    error instanceof GraphReadError && (error.code === 1 || error.code === 2)
  );
}

/**
 * Every row of the range, read chunk by chunk through `firstUrl` and its
 * pages. Other errors (permissions, rate limits) fail the read as before.
 */
export async function fetchInsightsInChunks(
  range: DateRange,
  firstUrl: (chunk: DateRange) => string,
): Promise<Array<unknown>> {
  const rows: Array<unknown> = [];
  for (const chunk of dateChunks(range)) {
    rows.push(...(await fetchChunk(chunk, firstUrl)));
  }
  return rows;
}

/** One chunk's rows; an overloaded chunk is read again as two halves. */
async function fetchChunk(
  chunk: DateRange,
  firstUrl: (chunk: DateRange) => string,
): Promise<Array<unknown>> {
  try {
    return await fetchPages(firstUrl(chunk));
  } catch (error) {
    const days = daysIn(chunk);
    if (!isMetaOverload(error) || days < MIN_SPLIT_DAYS * 2) {
      throw error;
    }
    const [first, second] = dateChunks(chunk, Math.ceil(days / 2));
    return [
      ...(await fetchChunk(first, firstUrl)),
      ...(await fetchChunk(second, firstUrl)),
    ];
  }
}

/** Every page of one read. */
async function fetchPages(firstUrl: string): Promise<Array<unknown>> {
  const rows: Array<unknown> = [];
  let next: string | null = firstUrl;
  while (next) {
    const response = await fetch(next);
    const page: GraphPage = await response.json();
    if (page.error) {
      throw new GraphReadError(
        page.error.message || JSON.stringify(page.error),
        page.error.code,
      );
    }
    rows.push(...(page.data ?? []));
    next = page.paging?.next ?? null;
  }
  return rows;
}

/** Days in a range, both ends counted. */
function daysIn(range: DateRange): number {
  return Math.round((utcDay(range.until) - utcDay(range.since)) / DAY_MS) + 1;
}

/** Midnight UTC of a yyyy-MM-dd day. */
function utcDay(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

/** A UTC timestamp as yyyy-MM-dd. */
function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
