/**
 * Request plumbing the platform adapters share (AIO-238). `fetch` and `sleep`
 * are injectable so tests can replay recorded responses.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type Sleep = (ms: number) => Promise<void>;

export const RATE_LIMIT_RETRIES = 2;

export const BACKOFF_BASE_MS = 2000;

/** One hung platform request must not hold the worker until its wall clock. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Abort signal for one platform request. */
export function requestTimeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

/** The global fetch, looked up at call time. */
export function defaultFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, init);
}

/** Resolves after `ms`. */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
