/** Paging of the chat collector's reads: a read that hits MAX_PAGES stops and reports itself incomplete. */

/** PostgREST returns at most this many rows per request. */
export const PAGE_ROWS = 1_000;

/** Pages one read may take. */
export const MAX_PAGES = 20;
