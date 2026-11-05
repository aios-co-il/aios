/**
 * Reads one ad account's operational status from the Graph API: the account
 * status, its running or stopped campaigns, its disapproved or unpaid ads, and
 * whether any ad is live. A cheap probe: no Insights request.
 */
import type { AccountSnapshot, MetaAd, MetaCampaign } from "./types.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
/** Pages followed per list; 10 x 200 rows covers any real account. */
const MAX_PAGES = 10;

type Fetch = (url: string) => Promise<Response>;

export type AccountRead =
  { ok: true; snapshot: AccountSnapshot } | { ok: false; error: string };

/**
 * Every call must succeed: a partial read could clear an open alert or report
 * "nothing live" for an account it only half read.
 */
export async function readAccount(
  adAccountId: string,
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<AccountRead> {
  try {
    const query = (path: string, params: Record<string, string>) => {
      const url = new URL(`${GRAPH}/${path}`);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      url.searchParams.set("access_token", token);
      return url.toString();
    };
    const [account, campaigns, blockedAds, liveAds] = await Promise.all([
      graphObject(
        fetchImpl,
        query(adAccountId, { fields: "name,account_status" }),
      ),
      graphList(
        fetchImpl,
        query(`${adAccountId}/campaigns`, {
          fields: "id,name,effective_status,issues_info",
          effective_status: '["ACTIVE","WITH_ISSUES"]',
          limit: "200",
        }),
      ),
      graphList(
        fetchImpl,
        query(`${adAccountId}/ads`, {
          fields: "id,name,effective_status,campaign{id,name,effective_status}",
          effective_status: '["DISAPPROVED","PENDING_BILLING_INFO"]',
          limit: "200",
        }),
      ),
      graphList(
        fetchImpl,
        query(`${adAccountId}/ads`, {
          fields: "id",
          // Live, or about to be: an ad still in review is not "nothing live".
          effective_status:
            '["ACTIVE","PENDING_REVIEW","IN_PROCESS","PREAPPROVED"]',
          limit: "1",
        }),
        true,
      ),
    ]);
    const accountStatus = Number(account.account_status);
    if (!Number.isInteger(accountStatus)) {
      return { ok: false, error: "account_status missing" };
    }
    return {
      ok: true,
      snapshot: {
        accountName: stringOrNull(account.name),
        accountStatus,
        campaigns: campaigns.map(toCampaign),
        blockedAds: blockedAds.map(toAd),
        hasLiveAd: liveAds.length > 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type GraphRow = Record<string, unknown>;

/** A Graph object; throws on an error body or a non-object answer. */
async function graphObject(fetchImpl: Fetch, url: string): Promise<GraphRow> {
  const body = await fetchJson(fetchImpl, url);
  if (!isRow(body)) {
    throw new Error("unexpected Graph answer");
  }
  return body;
}

/**
 * Every row of a Graph list, following `paging.next`; throws on any error page,
 * and when rows remain after MAX_PAGES. `firstPageOnly` reads one page (enough
 * to know whether any row exists).
 */
async function graphList(
  fetchImpl: Fetch,
  url: string,
  firstPageOnly = false,
): Promise<GraphRow[]> {
  const rows: GraphRow[] = [];
  let next: string | null = url;
  for (let page = 0; next; page += 1) {
    if (page === MAX_PAGES) {
      throw new Error(`more than ${MAX_PAGES} Graph pages`);
    }
    const body = await fetchJson(fetchImpl, next);
    if (!isRow(body) || !Array.isArray(body.data)) {
      throw new Error("unexpected Graph list");
    }
    rows.push(...body.data.filter(isRow));
    if (firstPageOnly) {
      return rows;
    }
    const paging = isRow(body.paging) ? body.paging : null;
    next = typeof paging?.next === "string" ? paging.next : null;
  }
  return rows;
}

/** The JSON body; a Graph `error` body throws with its message, never the URL (it holds the token). */
async function fetchJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url);
  const body: unknown = await response.json();
  if (isRow(body) && isRow(body.error)) {
    const message =
      typeof body.error.message === "string" ? body.error.message : "error";
    throw new Error(`Graph: ${message}`);
  }
  if (!response.ok) {
    throw new Error(`Graph HTTP ${response.status}`);
  }
  return body;
}

function toCampaign(row: GraphRow): MetaCampaign {
  return {
    id: String(row.id ?? ""),
    name: stringOrNull(row.name),
    effective_status: stringOrNull(row.effective_status),
    issues_count: Array.isArray(row.issues_info) ? row.issues_info.length : 0,
  };
}

function toAd(row: GraphRow): MetaAd {
  const campaign = isRow(row.campaign) ? row.campaign : null;
  return {
    id: String(row.id ?? ""),
    name: stringOrNull(row.name),
    effective_status: stringOrNull(row.effective_status),
    campaign: campaign
      ? {
          id: String(campaign.id ?? ""),
          name: stringOrNull(campaign.name),
          effective_status: stringOrNull(campaign.effective_status),
        }
      : null,
  };
}

function isRow(value: unknown): value is GraphRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
