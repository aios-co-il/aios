/**
 * Google Ads GAQL as a reconciliation source (AIO-238): campaign level,
 * segments.date in the customer's time zone. Read only; every request takes
 * one unit of the call budget.
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import type { FetchLike, Sleep } from "../_shared/reconcile/http.ts";
import type {
  CampaignDayRow,
  PlatformSource,
  ReconcileTable,
} from "../_shared/reconcile/types.ts";
import {
  type GoogleAuth,
  googleCustomerId,
  type GoogleRow,
  googleSearch,
} from "./google-api.ts";

export type GoogleSourceOptions = {
  getAuth: (table: ReconcileTable) => Promise<GoogleAuth>;
  budget: CallBudget;
  fetch?: FetchLike;
  sleep?: Sleep;
};

/** A source that reads Google Ads with each table's credentials, resolved once per table. */
export function createGoogleSource(opts: GoogleSourceOptions): PlatformSource {
  const auths = new Map<string, GoogleAuth>();
  const request = { budget: opts.budget, fetch: opts.fetch, sleep: opts.sleep };
  const search = async (
    table: ReconcileTable,
    customerId: string,
    query: string,
  ) => {
    let auth = auths.get(table.id);
    if (!auth) {
      auth = await opts.getAuth(table);
      auths.set(table.id, auth);
    }
    return googleSearch(auth, customerId, query, request);
  };

  return {
    name: "google",
    async account(table) {
      const customerId = googleCustomerId(
        table.integration_settings?.customer_id,
      );
      if (!customerId) {
        throw new ReconcileSourceError(
          "config",
          "no Google Ads customer on the table",
        );
      }
      const rows = await search(
        table,
        customerId,
        "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
      );
      const c = rows[0]?.customer || {};
      return {
        account_id: customerId,
        name: c.descriptiveName || null,
        currency: c.currencyCode || null,
        timezone: c.timeZone || "",
      };
    },
    async campaignDays(table, window, account) {
      // Campaign level only, same metrics the sync stores (cost, conversions,
      // conversions_value). segments.date is in the customer's time zone.
      const rows = await search(
        table,
        account.account_id,
        `SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${window.start}' AND '${window.end}'`,
      );
      return { rows: rows.map(campaignDay) };
    },
  };
}

/** A GAQL campaign row in the shape the sync stores. */
function campaignDay(r: GoogleRow): CampaignDayRow {
  const data = {
    date: String(r.segments?.date || ""),
    entity_level: "campaign",
    campaign_id: String(r.campaign?.id || ""),
    campaign_name: String(r.campaign?.name || ""),
    cost: (parseInt(String(r.metrics?.costMicros || "0"), 10) || 0) / 1_000_000,
    conversions: parseFloat(String(r.metrics?.conversions || "0")) || 0,
    conversions_value:
      parseFloat(String(r.metrics?.conversionsValue || "0")) || 0,
  };
  return {
    campaign_id: data.campaign_id,
    campaign_name: data.campaign_name || null,
    date: data.date,
    data,
  };
}
