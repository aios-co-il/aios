/**
 * Google Ads REST reads for the reconciliation (AIO-238): one GAQL
 * searchStream with backoff on rate limits. Responses are untyped external
 * JSON; the types here name only the fields the reconciliation reads.
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import {
  BACKOFF_BASE_MS,
  defaultFetch,
  defaultSleep,
  type FetchLike,
  RATE_LIMIT_RETRIES,
  requestTimeout,
  type Sleep,
} from "../_shared/reconcile/http.ts";
import type { SourceErrorKind } from "../_shared/reconcile/types.ts";

export const GOOGLE_ADS_API_VERSION = "v23";

export type GoogleAuth = {
  accessToken: string;
  developerToken: string;
  loginCustomerId: string;
};

export type GoogleRequestOptions = {
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
};

/** One result row of a GAQL query. */
export type GoogleRow = {
  customer?: {
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
  };
  segments?: { date?: string };
  campaign?: { id?: string | number; name?: string };
  metrics?: {
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
};

type GoogleBatch = {
  results?: GoogleRow[];
  error?: { status?: string; message?: string };
};

/** searchStream answers with a list of batches; an error may come as one object. */
type GoogleBody = GoogleBatch | GoogleBatch[] | null;

/** Every result row of a GAQL query, retrying rate limits with backoff. */
export async function googleSearch(
  auth: GoogleAuth,
  customerId: string,
  query: string,
  opts: GoogleRequestOptions,
): Promise<GoogleRow[]> {
  const doFetch = opts.fetch || defaultFetch;
  const sleep = opts.sleep || defaultSleep;
  for (let attempt = 0; ; attempt++) {
    opts.budget.take();
    const { res, body } = await postOnce(doFetch, auth, customerId, query);
    const failed =
      !res.ok ||
      !body ||
      (Array.isArray(body) ? body.some((b) => b?.error) : !!body.error);
    if (!failed) {
      const batches = Array.isArray(body) ? body : [body];
      return batches.flatMap((b) => b?.results || []);
    }
    const kind = classifyGoogleError(res.status, body);
    if (kind === "rate_limit" && attempt < RATE_LIMIT_RETRIES) {
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
      continue;
    }
    throw new ReconcileSourceError(
      kind,
      `Google Ads ${res.status}: ${googleError(body)?.message || "request failed"}`,
    );
  }
}

/** Classify a Google Ads REST error (searchStream returns an array or an object). */
export function classifyGoogleError(
  status: number,
  body: GoogleBody,
): SourceErrorKind {
  const st = String(googleError(body)?.status || "");
  if (status === 429 || st === "RESOURCE_EXHAUSTED") {
    return "rate_limit";
  }
  if (
    status === 401 ||
    status === 403 ||
    st === "UNAUTHENTICATED" ||
    st === "PERMISSION_DENIED"
  ) {
    return "auth";
  }
  return "platform";
}

/** Digits only, as the Google Ads API expects customer ids. */
export function googleCustomerId(raw: unknown): string | null {
  const id = String(raw || "").replace(/\D/g, "");
  return id || null;
}

/** The error of the first batch, or of the single error object. */
function googleError(body: GoogleBody) {
  return Array.isArray(body) ? body[0]?.error : body?.error;
}

/** One searchStream request and its JSON body (null when the body is not JSON). */
async function postOnce(
  doFetch: FetchLike,
  auth: GoogleAuth,
  customerId: string,
  query: string,
): Promise<{ res: Response; body: GoogleBody }> {
  let res: Response;
  let text: string;
  try {
    res = await doFetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          "developer-token": auth.developerToken,
          "login-customer-id": auth.loginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: requestTimeout(),
      },
    );
    text = await res.text();
  } catch (err) {
    throw new ReconcileSourceError(
      "platform",
      `Google Ads request failed: ${err instanceof Error ? err.message : err}`,
    );
  }
  try {
    return { res, body: JSON.parse(text) };
  } catch {
    return { res, body: null };
  }
}
