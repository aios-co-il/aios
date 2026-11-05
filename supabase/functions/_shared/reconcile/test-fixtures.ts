/**
 * Test helpers for the reconciliation (not imported by any edge function):
 * report tables, campaign rows, and a fetch that replays recorded platform
 * responses (AIO-238).
 */
import type { CampaignDayRow, ReconcileTable } from "./types.ts";

export const metaTable: ReconcileTable = {
  id: "t-meta",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_1" },
};

export const googleTable: ReconcileTable = {
  id: "t-google",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "google_ads",
  integration_settings: { customer_id: "123-456-7890" },
};

/** A campaign day whose data carries its id and date, named C<id> unless given a name. */
export function row(
  campaign_id: string,
  date: string,
  data: Record<string, unknown>,
): CampaignDayRow {
  return {
    campaign_id,
    campaign_name:
      typeof data.campaign_name === "string" && data.campaign_name
        ? data.campaign_name
        : `C${campaign_id}`,
    date,
    data: { campaign_id, date, ...data },
  };
}

export type Recorded = { match: RegExp; status?: number; body: unknown };

/** Replays recorded responses in order per URL pattern and logs every request. */
export function replay(recorded: Recorded[]) {
  const queue = [...recorded];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const i = queue.findIndex((r) => r.match.test(url));
    if (i < 0) {
      throw new Error(`unexpected request ${url}`);
    }
    const [hit] = queue.splice(i, 1);
    return Promise.resolve(
      new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 }),
    );
  };
  return { fetchFn, calls, left: () => queue.length };
}

/** A sleep that returns at once and records each wait. */
export function sleepRecorder() {
  const sleeps: number[] = [];
  const sleep = (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  };
  return { sleep, sleeps };
}
