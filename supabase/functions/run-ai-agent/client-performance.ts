/**
 * analyze_campaign_performance's numbers for one client: spend, leads,
 * purchases and revenue over the last 7 days and the 23 before, each row
 * counted by its campaign's report goal (reportCampaignGoalOf, adsRowOutcomes),
 * so Carmen quotes what the client's report shows for the same rows.
 */
import { getSpendFromData } from "../_shared/campaign-goal/ads-metrics.ts";
import {
  reportCampaignGoalOf,
  type CampaignGoalRecord,
  type CampaignGoalTable,
  type CampaignGoalVerdict,
} from "../_shared/campaign-goal/campaign-goals.ts";
import { adsRowOutcomes } from "../_shared/campaign-goal/outcomes.ts";

/** The client fields the tool reports. */
export type PerformanceClient = {
  id: string;
  name: string | null;
  agencies?: { name?: string | null } | null;
};

/**
 * What the reports total over some rows. Leads come only from lead campaigns
 * and purchases and revenue only from sales campaigns; CPL and ROAS use only
 * those campaigns' spend. A row of a table with no report goal (neither Meta
 * nor Google Ads) counts everything, as adsRowOutcomes counts a row without a
 * goal.
 */
export type ReportWindowTotals = {
  spend: number;
  leadSpend: number;
  ecommerceSpend: number;
  leads: number;
  purchases: number;
  revenue: number;
};

type VerdictOf = (record: CampaignGoalRecord) => CampaignGoalVerdict | null;

/** Totals of `records`, each counted by its campaign's report goal. */
export function reportWindowTotals(
  records: CampaignGoalRecord[],
  verdictOf: VerdictOf,
): ReportWindowTotals {
  const totals: ReportWindowTotals = {
    spend: 0,
    leadSpend: 0,
    ecommerceSpend: 0,
    leads: 0,
    purchases: 0,
    revenue: 0,
  };
  for (const record of records) {
    const data = record.data ?? {};
    const goal = verdictOf(record)?.goal;
    const spend = getSpendFromData(data);
    const outcomes = adsRowOutcomes(data, goal);
    totals.spend += spend;
    if (goal === undefined || goal === "leads") {
      totals.leadSpend += spend;
    }
    if (goal === undefined || goal === "ecommerce") {
      totals.ecommerceSpend += spend;
    }
    totals.leads += outcomes.leads;
    totals.purchases += outcomes.purchases;
    totals.revenue += outcomes.revenue;
  }
  return totals;
}

/** A client whose campaign tables have no rows in the last 30 days, or could not be read. */
export function staleClientEntry(
  client: PerformanceClient,
  readFailed = false,
): Record<string, unknown> {
  return {
    client_id: client.id,
    client_name: client.name,
    agency_name: client.agencies?.name ?? null,
    is_ecommerce: false,
    spend_7d: 0,
    spend_30d: 0,
    lead_spend_7d: 0,
    ecommerce_spend_7d: 0,
    leads_7d: 0,
    leads_30d: 0,
    cpl_7d: null,
    cpl_30d_avg: null,
    purchases_7d: 0,
    purchases_30d: 0,
    revenue_7d: 0,
    revenue_30d: 0,
    cpp_7d: null,
    cpp_change_pct: null,
    roas_7d: null,
    profit_7d: 0,
    spend_change_pct: null,
    cpl_change_pct: null,
    last_data_date: null,
    last_campaign_update: null,
    days_since_last_campaign_touch: null,
    sync_status: readFailed ? "read_failed" : "stale_or_empty",
    alert: readFailed
      ? "🟡 לא הצלחתי לקרוא את נתוני הקמפיין — לבדוק שוב"
      : "🟡 סנכרון ישן או חסר — טבלת קמפיין מחוברת אך אין נתונים ב-30 הימים האחרונים",
  };
}

/**
 * One synced client's entry. `records` are its campaign-level rows of the last
 * 30 days; `d7Str` starts the 7-day window. A client is ecommerce when one of
 * its campaigns is a sales campaign in its report.
 */
export function clientPerformanceEntry(input: {
  client: PerformanceClient;
  records: CampaignGoalRecord[];
  tables: CampaignGoalTable[];
  d7Str: string;
  now: Date;
}): Record<string, unknown> {
  const { client, records, d7Str, now } = input;
  const verdictOf = reportCampaignGoalOf(records, input.tables);
  const dateOf = (record: CampaignGoalRecord) =>
    String(record.data?.date ?? "");
  const last7d = records.filter((record) => dateOf(record) >= d7Str);
  const older = records.filter((record) => dateOf(record) < d7Str);
  const current = reportWindowTotals(last7d, verdictOf);
  const previous = reportWindowTotals(older, verdictOf);

  const days7 = Math.max(last7d.length, 1);
  const daysOlder = Math.max(older.length, 1);
  const dailySpend7 = current.spend / days7;
  const dailySpendOlder = previous.spend / daysOlder;
  const spendChangePct =
    dailySpendOlder > 0
      ? ((dailySpend7 - dailySpendOlder) / dailySpendOlder) * 100
      : null;

  const cpl7 = current.leads > 0 ? current.leadSpend / current.leads : null;
  const cplOlder =
    previous.leads > 0 ? previous.leadSpend / previous.leads : null;
  const cplChangePct =
    cplOlder && cpl7 ? ((cpl7 - cplOlder) / cplOlder) * 100 : null;

  const cpp7 =
    current.purchases > 0 ? current.ecommerceSpend / current.purchases : null;
  const cppOlder =
    previous.purchases > 0
      ? previous.ecommerceSpend / previous.purchases
      : null;
  const cppChangePct =
    cppOlder && cpp7 ? ((cpp7 - cppOlder) / cppOlder) * 100 : null;
  const roas7 =
    current.ecommerceSpend > 0 ? current.revenue / current.ecommerceSpend : null;
  const profit7 = current.revenue - current.ecommerceSpend;

  const lastCampaignUpdate = latest(records, "updated_time");
  const daysSinceLastCampaignTouch = lastCampaignUpdate
    ? Math.floor(
        (now.getTime() - new Date(lastCampaignUpdate).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const isEcom = records.some(
    (record) => verdictOf(record)?.goal === "ecommerce",
  );
  const ecomAlert =
    roas7 !== null && roas7 < 1
      ? "🔴 ROAS<1 הפסד"
      : current.purchases === 0 && current.ecommerceSpend > 0
        ? "🔴 אין רכישות"
        : roas7 !== null && roas7 < 1.5
          ? "🟠 ROAS נמוך"
          : cppChangePct !== null && cppChangePct > 25
            ? "🟠 CPP עלה"
            : "🟢 תקין";
  const leadAlert =
    spendChangePct !== null && spendChangePct > 15
      ? "🔴 התייקרות"
      : cplChangePct !== null && cplChangePct > 20
        ? "🟡 עלייה בעלות לליד"
        : "🟢 תקין";

  return {
    client_id: client.id,
    client_name: client.name,
    agency_name: client.agencies?.name ?? null,
    is_ecommerce: isEcom,
    spend_7d: round(current.spend),
    spend_30d: round(current.spend + previous.spend),
    lead_spend_7d: round(current.leadSpend),
    ecommerce_spend_7d: round(current.ecommerceSpend),
    leads_7d: round(current.leads),
    leads_30d: round(current.leads + previous.leads),
    cpl_7d: cpl7 ? round(cpl7) : null,
    cpl_30d_avg: cplOlder ? round(cplOlder) : null,
    // Ecommerce metrics — present for all clients but the skill only uses them when is_ecommerce=true
    purchases_7d: round(current.purchases),
    purchases_30d: round(current.purchases + previous.purchases),
    revenue_7d: round(current.revenue),
    revenue_30d: round(current.revenue + previous.revenue),
    cpp_7d: cpp7 ? round(cpp7) : null,
    cpp_change_pct: cppChangePct !== null ? round(cppChangePct, 1) : null,
    roas_7d: roas7 !== null ? round(roas7) : null,
    profit_7d: round(profit7),
    spend_change_pct: spendChangePct !== null ? round(spendChangePct, 1) : null,
    cpl_change_pct: cplChangePct !== null ? round(cplChangePct, 1) : null,
    last_data_date: latest(records, "date"),
    last_campaign_update: lastCampaignUpdate,
    days_since_last_campaign_touch: daysSinceLastCampaignTouch,
    sync_status: "ok",
    alert: isEcom ? ecomAlert : leadAlert,
  };
}

/** The latest non-empty value of `field` across the rows (ISO dates sort as text). */
function latest(records: CampaignGoalRecord[], field: string): string | null {
  let best: string | null = null;
  for (const record of records) {
    const value = record.data?.[field];
    if (value && (best === null || String(value) > best)) {
      best = String(value);
    }
  }
  return best;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
