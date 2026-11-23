import { throwIfError } from "./context.ts";

/** Rows per page and the page cap of readAllPages. */
export const PAGE_SIZE = 1000;
export const MAX_PAGES = 10;

/**
 * Every row of a query, page by page (`page(from, to)` must apply a stable
 * order and `.range(from, to)`). Stops at MAX_PAGES and says so with
 * `partial`, so a cap never reads as the whole answer.
 */
export async function readAllPages<T>(
  label: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Array<T> | null;
    error: { message: string } | null;
  }>,
  pageSize = PAGE_SIZE,
): Promise<{ rows: Array<T>; partial: boolean }> {
  const rows: Array<T> = [];
  for (let index = 0; index < MAX_PAGES; index++) {
    const from = index * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    throwIfError(label, error);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      return { rows, partial: false };
    }
  }
  console.warn(`[seo-read] ${label}: stopped at ${rows.length} rows`);
  return { rows, partial: true };
}
