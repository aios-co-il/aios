/**
 * Meta Graph API reads for the reconciliation (AIO-238): one GET with backoff
 * on rate limits, and paging. Responses are untyped external JSON; the types
 * here name only the fields the reconciliation reads.
 */
import type { CallBudget } from "./budget.ts";
import { ReconcileSourceError } from "./errors.ts";
import {
  BACKOFF_BASE_MS,
  defaultFetch,
  defaultSleep,
  type FetchLike,
  RATE_LIMIT_RETRIES,
  requestTimeout,
  type Sleep,
} from "./http.ts";
import type { SourceErrorKind } from "./types.ts";

export const META_GRAPH_VERSION = "v21.0";

export type MetaRequestOptions = {
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
};

type MetaApiError = {
  code?: number;
  type?: string;
  error_subcode?: number;
  message?: string;
};

/** One page of a Graph list, and the link to the next. */
type MetaPage<T> = { data?: T[]; paging?: { next?: string } };

/** One Graph GET with backoff on rate limits; throws a typed, redacted error. */
export async function metaGetJson<T extends object>(
  url: string,
  opts: MetaRequestOptions,
): Promise<T> {
  const doFetch = opts.fetch || defaultFetch;
  const sleep = opts.sleep || defaultSleep;
  for (let attempt = 0; ; attempt++) {
    opts.budget.take();
    const { res, body } = await getOnce<T>(doFetch, url);
    if (res.ok && body && !body.error) {
      return body;
    }
    const kind = classifyMetaError(res.status, body?.error || null);
    if (kind === "rate_limit" && attempt < RATE_LIMIT_RETRIES) {
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
      continue;
    }
    throw new ReconcileSourceError(
      kind,
      `Meta ${res.status}: ${body?.error?.message || "request failed"}`,
      kind === "rate_limit" && isMetaAccountThrottle(Number(body?.error?.code))
        ? "account"
        : "platform",
    );
  }
}

/** Follow `paging.next` up to `maxPages` pages and return every row. */
export async function metaGetPaged<T>(
  firstUrl: string,
  opts: MetaRequestOptions & { maxPages: number },
): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = firstUrl;
  let pages = 0;
  while (next) {
    if (pages >= opts.maxPages) {
      throw new ReconcileSourceError(
        "platform",
        `Meta paging exceeded ${opts.maxPages} pages`,
      );
    }
    const page: MetaPage<T> = await metaGetJson<MetaPage<T>>(next, opts);
    pages += 1;
    if (Array.isArray(page.data)) {
      rows.push(...page.data);
    }
    next = typeof page.paging?.next === "string" ? page.paging.next : null;
  }
  return rows;
}

/** A Graph URL for `path` with `params` and the token. */
export function graphUrl(
  path: string,
  params: Record<string, string>,
  token: string,
): string {
  return (
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${path}?` +
    new URLSearchParams({ ...params, access_token: token }).toString()
  );
}

/** Classify a Graph API error body / HTTP status. */
export function classifyMetaError(
  status: number,
  error: { code?: number; type?: string; error_subcode?: number } | null,
): SourceErrorKind {
  const code = Number(error?.code);
  if (status === 429 || META_RATE_LIMIT_CODES.has(code)) {
    return "rate_limit";
  }
  if (
    status === 401 ||
    META_AUTH_CODES.has(code) ||
    code === 10 ||
    (code >= 200 && code < 300)
  ) {
    return "auth";
  }
  return "platform";
}

/** `act_<id>` form the Graph API expects. */
export function metaAccountPath(raw: unknown): string | null {
  const id = String(raw || "").trim();
  if (!id) {
    return null;
  }
  return id.startsWith("act_") ? id : `act_${id}`;
}

const META_RATE_LIMIT_CODES = new Set([
  4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009,
  80014,
]);

const META_AUTH_CODES = new Set([102, 190, 463, 467]);

/** Business-use-case throttles: they limit one ad account, not the app or token. */
function isMetaAccountThrottle(code: number): boolean {
  return code >= 80000 && code <= 80014;
}

/** One request and its JSON body (null when the body is not JSON). */
async function getOnce<T>(
  doFetch: FetchLike,
  url: string,
): Promise<{ res: Response; body: (T & { error?: MetaApiError }) | null }> {
  try {
    const res = await doFetch(url, { signal: requestTimeout() });
    const body: (T & { error?: MetaApiError }) | null = await res
      .json()
      .catch(() => null);
    return { res, body };
  } catch (err) {
    throw new ReconcileSourceError(
      "platform",
      `Meta request failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}
