import { format, parseISO } from "date-fns";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  facebookCampaignKey,
  getSpendFromData,
  type FacebookCampaignRow,
} from "@/lib/adsMetrics";
import {
  campaignOffKeys,
  reportOffLookup,
  type CampaignOffTable,
} from "@/lib/campaignOffState";

/** A dashboard record as both dashboard pages pass it to the Facebook tab. */
export type FacebookTabRecord = {
  _source?: string;
  _tableId?: string;
  data?: Record<string, unknown> | null;
};

/** The figures of a set of campaigns added up, for the tab's KPI strip. */
export type FacebookTabTotals = Pick<
  FacebookCampaignRow,
  | "impressions"
  | "clicks"
  | "spend"
  | "leads"
  | "purchases"
  | "purchase_value"
  | "add_to_cart"
>;

/** One day of the tab's charts. */
export type FacebookTabDay = {
  date: string;
  day: string;
  spend: number;
  clicks: number;
};

const META_SOURCES: ReadonlySet<string> = new Set([
  "facebook_insights",
  "facebook_ecommerce",
]);

/** Adds up the campaigns' delivery and results. */
export function facebookTabTotals(
  campaigns: Array<FacebookCampaignRow>,
): FacebookTabTotals {
  const totals: FacebookTabTotals = {
    impressions: 0,
    clicks: 0,
    spend: 0,
    leads: 0,
    purchases: 0,
    purchase_value: 0,
    add_to_cart: 0,
  };
  for (const campaign of campaigns) {
    totals.impressions += campaign.impressions;
    totals.clicks += campaign.clicks;
    totals.spend += campaign.spend;
    totals.leads += campaign.leads;
    totals.purchases += campaign.purchases;
    totals.purchase_value += campaign.purchase_value;
    totals.add_to_cart += campaign.add_to_cart;
  }
  return totals;
}

/**
 * The Meta campaign-level records the tab's tables are summed from: the same
 * rows `dashboardFacebookCampaigns` adds, so the charts match the tables.
 */
export function facebookCampaignRecords(
  records: Array<FacebookTabRecord>,
): Array<FacebookTabRecord> {
  return records.filter(
    (record) =>
      META_SOURCES.has(record._source ?? "") &&
      shouldIncludeInAdsDashboardAggregate(record.data, record._source),
  );
}

/** Spend and clicks per day, oldest first. */
export function facebookTabDays(
  records: Array<FacebookTabRecord>,
): Array<FacebookTabDay> {
  const byDate = new Map<string, FacebookTabDay>();
  for (const record of records) {
    const data = record.data ?? {};
    const date = typeof data.date === "string" ? data.date.slice(0, 10) : "";
    if (!date) {
      continue;
    }
    const day = byDate.get(date) ?? {
      date,
      day: format(parseISO(date), "dd/MM"),
      spend: 0,
      clicks: 0,
    };
    day.spend += getSpendFromData(data);
    day.clicks += Number(data.clicks) || 0;
    byDate.set(date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Whether each campaign is on, keyed like the tab's rows (by campaign name),
 * by the reports' on/off rule: off when its report is switched off or its
 * latest Meta status is paused, removed or ended (campaignOffKeys).
 */
export function facebookCampaignOnOf(
  records: Array<FacebookTabRecord>,
  tables: Array<CampaignOffTable>,
): (name: string) => boolean {
  const offKeys = campaignOffKeys(
    records,
    (data) => facebookCampaignKey(data),
    reportOffLookup(tables),
  );
  return (name) => !offKeys.has(name);
}

/** Spend per result; null without results, so no change is shown. */
export function costPer(spend: number, results: number): number | null {
  return results > 0 ? spend / results : null;
}
