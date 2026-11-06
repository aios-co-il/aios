import { getSpendFromData } from "./campaign-goal/ads-metrics.ts";
import { reportCampaignGoalOf } from "./campaign-goal/campaign-goals.ts";
import {
  latestCampaignStatuses,
  resolveCampaignDeliveryStatus,
} from "./campaign-goal/delivery-status.ts";
import {
  resolveCampaignGoalVotes,
  voteSpend,
} from "./campaign-goal/goal-vote.ts";
import { adsRowOutcomes, goalResultCount } from "./campaign-goal/outcomes.ts";
import { pulseGoalName } from "./campaign-goal/report-goals.ts";
import {
  addCampaignPlace,
  campaignPlaces,
  campaignTarget,
  campaignTargetFields,
  compareCampaignItems,
  UNNAMED_CAMPAIGN,
} from "./pulse/campaign-target.ts";
import { gatePulseAlert } from "./pulse/alert-gate.ts";
import { resolvePulseCostRules } from "./pulse/cost-rules.ts";
import {
  measureBaselineGuard,
  noResultsIn3Days,
  targetStatusReasons,
  targetlessStatus,
} from "./pulse/targetless-status.ts";

const DAY_MS = 86_400_000;
/** Days in a row with no spend after which spending again is a new run. */
const RESUME_PAUSE_DAYS = 7;

function firstPresent(data, fields) {
  for (const field of fields) {
    if (
      data[field] !== null &&
      data[field] !== undefined &&
      data[field] !== ""
    ) {
      const value = Number(data[field]);
      if (Number.isFinite(value)) return { value, field };
    }
  }
  return { value: null, field: null };
}

function utcDate(ymd) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** @param {string} nowYmd */
export function pulseTrendWindows(nowYmd) {
  const today = utcDate(nowYmd);
  const end = addDays(today, -1);
  const current3Start = addDays(end, -2);
  const current7Start = addDays(end, -6);
  return {
    current3: { start: ymd(current3Start), end: ymd(end) },
    current7: { start: ymd(current7Start), end: ymd(end) },
    baseline: {
      start: ymd(addDays(current7Start, -28)),
      end: ymd(addDays(current7Start, -1)),
    },
    today: ymd(today),
    queryStart: ymd(addDays(current7Start, -28)),
    queryEnd: ymd(today),
  };
}

function numberValue(data, fields) {
  return firstPresent(data, fields).value ?? 0;
}

/**
 * How well a daily row describes its campaign, to pick one row per day among
 * duplicate report tables: one with the campaign id and its Meta setup wins.
 */
function recordScore(data) {
  let score = 0;
  if (data.campaign_id) score += 2;
  if (data.campaign_objective || data.optimization_goal) score += 2;
  return score;
}

function normalizeCampaignName(name) {
  return String(name || UNNAMED_CAMPAIGN)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function campaignIdentity(data, platform) {
  const id = data.campaign_id || data.campaignId;
  const name =
    data.campaign_name || data.campaignName || data.campaign || data.name;
  const normalizedName = normalizeCampaignName(name);
  return {
    id: id ? String(id) : null,
    name: name ? String(name) : UNNAMED_CAMPAIGN,
    normalizedName,
    key: `${platform}:${id ? `id:${id}` : `name:${normalizedName || "unknown"}`}`,
  };
}

/** One logical campaign per client/platform/goal/name — duplicate Meta tables often reuse the name with a different id. */
function canonicalCampaignMergeKey(clientId, platform, goal, identity) {
  return `${clientId}:${platform}:${goal}:name:${identity.normalizedName || normalizeCampaignName(identity.name)}`;
}

function preferPulseCampaignRow(prev, row) {
  if (!prev) return row;
  if (row.campaign_id && !prev.campaign_id) return row;
  if (prev.campaign_id && !row.campaign_id) return prev;
  if ((row.spend_7d || 0) > (prev.spend_7d || 0)) return row;
  if ((row.spend_7d || 0) < (prev.spend_7d || 0)) return prev;
  return row.campaign_id ? row : prev;
}

export function dedupePulseCampaignRows(rows = []) {
  const byMergeKey = new Map();
  for (const row of rows) {
    const mergeKey = canonicalCampaignMergeKey(
      row.client_id,
      row.platform,
      row.goal,
      {
        normalizedName: normalizeCampaignName(row.campaign_name),
        name: row.campaign_name,
      },
    );
    byMergeKey.set(
      mergeKey,
      preferPulseCampaignRow(byMergeKey.get(mergeKey), row),
    );
  }
  return Array.from(byMergeKey.values());
}

function platformForIntegration(type) {
  if (type === "google_ads") return "google";
  if (type === "facebook_insights" || type === "facebook_ecommerce")
    return "meta";
  return "unknown";
}

/**
 * A window's totals. Results and revenue are what the report counts for the
 * campaign's report goal (goalResultCount, adsRowOutcomes): purchases for
 * sales, leads for leads, none for traffic.
 */
function aggregate(rows, reportGoal) {
  let spend = 0;
  let outcomes = 0;
  let hasOutcomes = false;
  let revenue = 0;
  let impressions = 0;
  let clicks = 0;
  let newFollowers = null;
  let reach = 0;
  let frequencyWeighted = 0;
  let frequencyWeight = 0;
  let freshest = null;

  for (const row of rows) {
    const data = row.data || {};
    spend += getSpendFromData(data);
    impressions += numberValue(data, ["impressions"]);
    clicks += numberValue(data, ["link_clicks", "clicks"]);
    // Rows synced before follows were stored carry no count: not a real 0.
    if (data.new_followers !== undefined && data.new_followers !== null) {
      newFollowers = (newFollowers ?? 0) + numberValue(data, ["new_followers"]);
    }
    reach += numberValue(data, ["reach"]);
    revenue += adsRowOutcomes(data, reportGoal).revenue;
    const result = goalResultCount(data, reportGoal);
    if (result !== null) {
      outcomes += result;
      hasOutcomes = true;
    }
    const frequency = firstPresent(data, ["frequency"]).value;
    if (frequency !== null) {
      const weight = numberValue(data, ["reach"]) || 1;
      frequencyWeighted += frequency * weight;
      frequencyWeight += weight;
    }
    if (typeof data.date === "string" && (!freshest || data.date > freshest))
      freshest = data.date;
  }

  return {
    spend,
    outcomes: hasOutcomes ? outcomes : null,
    revenue,
    impressions,
    clicks,
    newFollowers,
    reach,
    frequency: frequencyWeight ? frequencyWeighted / frequencyWeight : null,
    efficiency: hasOutcomes && outcomes > 0 ? spend / outcomes : null,
    roas: reportGoal === "ecommerce" && spend > 0 ? revenue / spend : null,
    freshest,
  };
}

function normalizedBaseline(rows, reportGoal, currentDates) {
  if (!rows.length) return aggregate([], reportGoal);
  const weekdays = new Set(
    currentDates.map((date) => utcDate(date).getUTCDay()),
  );
  const matching = rows.filter((row) =>
    weekdays.has(utcDate(row.data.date).getUTCDay()),
  );
  const raw = aggregate(matching, reportGoal);
  const representedDays = new Set(matching.map((row) => row.data.date)).size;
  const scale = representedDays > 0 ? currentDates.length / representedDays : 0;
  return {
    ...raw,
    spend: raw.spend * scale,
    outcomes: raw.outcomes === null ? null : raw.outcomes * scale,
    revenue: raw.revenue * scale,
    impressions: raw.impressions * scale,
    reach: raw.reach * scale,
  };
}

function pct(current, baseline, lowerIsBetter) {
  if (current === null || baseline === null || baseline === 0) return null;
  const raw = ((current - baseline) / Math.abs(baseline)) * 100;
  return lowerIsBetter ? raw : -raw;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function classifyStatus({
  goal,
  current3,
  current7,
  baseline3,
  baseline7,
  baselineGuard = { outcomes: null, days: 0 },
  target,
  deliveryStatus = "unknown",
  costRules = resolvePulseCostRules(null),
}) {
  if (deliveryStatus === "paused") {
    return {
      status: "healthy",
      tier: "normal",
      reason:
        current7.spend > 0
          ? "קמפיין מושהה — ההוצאה בחלון היא מלפני ההשהיה"
          : "קמפיין מושהה — אין הוצאה פעילה",
      alertEligible: false,
    };
  }
  if (deliveryStatus === "removed") {
    return {
      status: "healthy",
      tier: "normal",
      reason: "קמפיין הוסר/לא פעיל",
      alertEligible: false,
    };
  }
  if (deliveryStatus === "ended") {
    return {
      status: "healthy",
      tier: "normal",
      reason: "קמפיין הסתיים",
      alertEligible: false,
    };
  }
  if (goal === "engagement") {
    // The report measures traffic by delivery and spend only: no result to judge.
    return {
      status: "healthy",
      tier: "normal",
      reason: "קמפיין תנועה — נמדד בהוצאה ובחשיפה בלבד",
      alertEligible: false,
    };
  }
  if (current7.outcomes === null) {
    return {
      status: "warning",
      tier: "missing_data",
      reason: "נתון התוצאה חסר במקור ואינו מוצג כאפס",
      alertEligible: false,
    };
  }
  if (current7.spend > 0 && current7.outcomes === 0) {
    return {
      status: "critical",
      tier: "exception",
      reason: "קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים",
      alertEligible: true,
    };
  }

  const currentEfficiency =
    target?.kind === "roas" ? current7.roas : current7.efficiency;
  const current3Efficiency =
    target?.kind === "roas" ? current3.roas : current3.efficiency;
  if (target && currentEfficiency !== null) {
    const bad7 =
      target.direction === "minimum"
        ? currentEfficiency < target.value
        : currentEfficiency > target.value;
    const bad3 =
      current3Efficiency !== null &&
      (target.direction === "minimum"
        ? current3Efficiency < target.value
        : current3Efficiency > target.value);
    const reasons = targetStatusReasons(target);
    if (bad7 && bad3) {
      return {
        status: "critical",
        tier: "exception",
        reason: reasons.breach,
        alertEligible: true,
      };
    }
    if (bad7) {
      return {
        status: "warning",
        tier: "watch",
        reason: reasons.drift,
        alertEligible: false,
      };
    }
    return {
      status: "healthy",
      tier: "normal",
      reason: reasons.within,
      alertEligible: false,
    };
  }

  const useRoas = goal === "ecommerce" && target?.kind !== "cpa";
  const lowerIsBetter = !useRoas;
  // The 7-day window has results here (the cases without any returned above).
  const trend3 = noResultsIn3Days(current3, useRoas)
    ? Number.POSITIVE_INFINITY
    : pct(
        useRoas ? current3.roas : current3.efficiency,
        useRoas ? baseline3.roas : baseline3.efficiency,
        lowerIsBetter,
      );
  const trend7 = pct(
    useRoas ? current7.roas : current7.efficiency,
    useRoas ? baseline7.roas : baseline7.efficiency,
    lowerIsBetter,
  );
  return targetlessStatus({
    goal,
    trend3,
    trend7,
    spend7d: current7.spend,
    guard: baselineGuard,
    rules: costRules,
    target,
  });
}

function datesBetween(start, end) {
  const dates = [];
  for (let date = utcDate(start); date <= utcDate(end); date = addDays(date, 1))
    dates.push(ymd(date));
  return dates;
}

/**
 * One row per campaign with its 3/7-day numbers, baseline, target and status.
 * Each campaign's goal and result count are the report's for the same rows
 * (reportCampaignGoalOf, goalResultCount), and its status is its latest dated
 * row's (latestCampaignStatuses), so the pulse and the reports never disagree.
 * `alertRules` is the tenant's tenant_heartbeat_settings.pulse_alert_rules: the
 * snapshot and the dashboard pass the same value, so the cost thresholds for
 * campaigns without a target (manager.cost) are the same on both sides.
 * @param {{ records?: Array<{ table_id: string, data?: object | null }>, tables?: object[], nowYmd: string, alertRules?: unknown }} input
 */
export function buildPulseCampaignRows({
  records = [],
  tables = [],
  nowYmd,
  alertRules = null,
}) {
  const windows = pulseTrendWindows(nowYmd);
  const usable = usableCampaignRecords(records, tables, windows);
  const verdictOf = reportCampaignGoalOf(
    usable.map((item) => item.record),
    tables,
  );
  const { campaigns, placesByCampaign, spendDays } = campaignDays(
    usable,
    verdictOf,
  );
  const context = {
    windows,
    spendDays,
    rules: resolvePulseCostRules(alertRules),
    current3Dates: datesBetween(windows.current3.start, windows.current3.end),
    current7Dates: datesBetween(windows.current7.start, windows.current7.end),
  };
  const rows = [];
  for (const [campaignKey, items] of campaigns) {
    const places = campaignPlaces(placesByCampaign, campaignKey);
    rows.push(pulseCampaignRow(items, places, context));
  }
  return dedupePulseCampaignRows(rows).sort(
    (a, b) =>
      String(a.client_id).localeCompare(String(b.client_id)) ||
      String(a.campaign_name).localeCompare(String(b.campaign_name), "he"),
  );
}

/** Campaign-level rows of a Meta or Google table inside the trend windows. */
function usableCampaignRecords(records, tables, windows) {
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  const usable = [];
  for (const record of records) {
    const data = record.data || {};
    if (String(data.entity_level || "campaign").toLowerCase() !== "campaign")
      continue;
    if (
      typeof data.date !== "string" ||
      data.date < windows.queryStart ||
      data.date > windows.queryEnd
    )
      continue;
    const table = tableMap.get(record.table_id);
    if (!table) continue;
    const platform = platformForIntegration(table.integration_type);
    if (platform === "unknown") continue;
    usable.push({
      record,
      table,
      platform,
      identity: campaignIdentity(data, platform),
    });
  }
  return usable;
}

/**
 * The rows of each campaign, one per day (the best row among duplicate report
 * tables), keyed by client, platform, report goal and name, with every table
 * the campaign is read from.
 */
function campaignDays(usable, verdictOf) {
  const goalOf = campaignGoals(usable, verdictOf);
  const placesByCampaign = new Map();
  const spendDays = new Map();
  const byDay = new Map();
  for (const item of usable) {
    const verdict = goalOf.get(campaignIdentityKey(item));
    if (!verdict) continue;
    const goal = pulseGoalName(verdict.goal);
    const campaignKey = canonicalCampaignMergeKey(
      item.table.client_id,
      item.platform,
      goal,
      item.identity,
    );
    // Read from every row, before the one-row-per-day pick below, so a
    // duplicate table's ₪0 rows cannot make a running campaign look new.
    noteSpendDay(spendDays, campaignKey, item);
    addCampaignPlace(placesByCampaign, campaignKey, {
      table: item.table,
      identity: item.identity,
    });
    const candidate = {
      ...item,
      campaignKey,
      goal,
      reportGoal: verdict.goal,
      source: verdict.source,
      score: recordScore(item.record.data),
    };
    const dayKey = `${campaignKey}:${item.record.data.date}`;
    const previous = byDay.get(dayKey);
    if (!previous || compareCampaignItems(candidate, previous, goal) < 0) {
      byDay.set(dayKey, candidate);
    }
  }
  const campaigns = new Map();
  for (const item of byDay.values()) {
    const list = campaigns.get(item.campaignKey) || [];
    list.push(item);
    campaigns.set(item.campaignKey, list);
  }
  return { campaigns, placesByCampaign, spendDays };
}

/** Records each day a campaign id spent, per pulse campaign. */
function noteSpendDay(spendDays, campaignKey, item) {
  if (!(getSpendFromData(item.record.data) > 0)) {
    return;
  }
  const key = campaignIdKey(campaignKey, item.identity.id);
  const days = spendDays.get(key) || new Set();
  days.add(String(item.record.data.date).slice(0, 10));
  spendDays.set(key, days);
}

/** One campaign id inside a pulse campaign (a relaunch keeps the name). */
function campaignIdKey(campaignKey, campaignId) {
  return `${campaignKey}\u0000${campaignId}`;
}

/**
 * One goal per campaign across duplicate report tables. Each table's report
 * goal votes (resolveCampaignGoalVotes: the strongest signal, then spend), so
 * a campaign read from a leads-only and an ecommerce table stays one campaign.
 */
function campaignGoals(usable, verdictOf) {
  const votes = [];
  for (const item of usable) {
    const verdict = verdictOf(item.record);
    if (!verdict) continue;
    votes.push({
      key: campaignIdentityKey(item),
      goal: verdict.goal,
      source: verdict.source,
      spend: voteSpend(item.record.data),
    });
  }
  return resolveCampaignGoalVotes(votes);
}

/** A campaign across its report tables: client, platform and name. */
function campaignIdentityKey(item) {
  return canonicalCampaignMergeKey(
    item.table.client_id,
    item.platform,
    "*",
    item.identity,
  );
}

/**
 * A campaign's delivery status: its latest dated row that states one, else
 * the operational state its tables store for its id (Google rows carry none).
 */
function campaignDeliveryStatus(items) {
  const latest = latestCampaignStatuses(
    items.map((item) => item.record),
    () => "campaign",
  ).get("campaign");
  if (latest) return latest;
  // Only the id on the latest dated row: a relaunch under the same name (old
  // id PAUSED, new id ENABLED or not stored yet) must not borrow the old id's
  // state, whatever order rows arrive in.
  const newest = latestCampaignItem(items);
  return resolveCampaignDeliveryStatus(
    { campaign_id: newest.identity.id },
    newest.table.integration_settings || {},
  );
}

/** The campaign's latest dated item; its id is the one running now. */
function latestCampaignItem(items) {
  return [...items].sort(compareLatestFirst)[0];
}

/**
 * Full days the running id has spent in its current run, through the last
 * full day. A relaunch under the same name counts from its new id, and a
 * campaign that resumes after a long pause starts a new run (David,
 * 2026-11-06). Rows reach back ~35 days, so an older campaign counts as old
 * enough.
 */
function fullDaysRunning(items, spendDays, lastFullDay) {
  const newest = latestCampaignItem(items);
  const days = spendDays.get(
    campaignIdKey(newest.campaignKey, newest.identity.id),
  );
  if (!days) {
    return 0;
  }
  const runStart = currentRunStart([...days].sort());
  return Math.round((utcDate(lastFullDay) - utcDate(runStart)) / DAY_MS) + 1;
}

/**
 * The first spend day after the last long pause: at least
 * RESUME_PAUSE_DAYS days in a row with no spend.
 */
function currentRunStart(sortedDays) {
  let runStart = sortedDays[0];
  for (let i = 1; i < sortedDays.length; i++) {
    const daysWithoutSpend =
      Math.round(
        (utcDate(sortedDays[i]) - utcDate(sortedDays[i - 1])) / DAY_MS,
      ) - 1;
    if (daysWithoutSpend >= RESUME_PAUSE_DAYS) {
      runStart = sortedDays[i];
    }
  }
  return runStart;
}

/** Latest dated row first; ties break on table id, then campaign id. */
function compareLatestFirst(a, b) {
  return (
    String(b.record.data.date).localeCompare(String(a.record.data.date)) ||
    String(a.table.id).localeCompare(String(b.table.id)) ||
    String(a.identity.id).localeCompare(String(b.identity.id))
  );
}

/** One campaign's pulse row from its daily rows. */
function pulseCampaignRow(items, places, context) {
  const { windows, rules, current3Dates, current7Dates } = context;
  const sample = items.reduce((best, item) =>
    compareCampaignItems(item, best, item.goal) < 0 ? item : best,
  );
  const { goal, reportGoal } = sample;
  const campaignRecords = items.map((item) => item.record);
  const inWindow = (start, end) =>
    campaignRecords.filter(
      (row) => row.data.date >= start && row.data.date <= end,
    );
  const current3 = aggregate(
    inWindow(windows.current3.start, windows.current3.end),
    reportGoal,
  );
  const current7 = aggregate(
    inWindow(windows.current7.start, windows.current7.end),
    reportGoal,
  );
  const today = aggregate(inWindow(windows.today, windows.today), reportGoal);
  const baselineRows = inWindow(windows.baseline.start, windows.baseline.end);
  const baseline3 = normalizedBaseline(baselineRows, reportGoal, current3Dates);
  const baseline7 = normalizedBaseline(baselineRows, reportGoal, current7Dates);
  const baselineGuard = measureBaselineGuard(
    baselineRows,
    aggregate(baselineRows, reportGoal).outcomes,
    (row) => getSpendFromData(row.data),
  );
  const settings = sample.table.integration_settings || {};
  const deliveryStatus = campaignDeliveryStatus(items);
  const target = campaignTarget(places, goal);
  const status = gatePulseAlert(
    classifyStatus({
      goal,
      current3,
      current7,
      baseline3,
      baseline7,
      baselineGuard,
      target,
      deliveryStatus,
      costRules: rules,
    }),
    {
      goal,
      deliveryStatus,
      spend3d: current3.spend,
      fullDaysRunning: fullDaysRunning(
        items,
        context.spendDays,
        windows.current3.end,
      ),
    },
  );
  const useRoas = goal === "ecommerce" && target?.kind !== "cpa";
  const lowerIsBetter = !useRoas;
  const efficiency3 = useRoas ? current3.roas : current3.efficiency;
  const efficiency7 = useRoas ? current7.roas : current7.efficiency;
  const efficiencyToday = useRoas ? today.roas : today.efficiency;
  const baselineEfficiency3 = useRoas ? baseline3.roas : baseline3.efficiency;
  const baselineEfficiency7 = useRoas ? baseline7.roas : baseline7.efficiency;
  const lastChangeCandidates = [
    ...items.map((item) => item.record.data.updated_time),
    settings.last_campaign_updated_at,
    settings.last_meta_activity?.at,
  ]
    .filter(Boolean)
    .map(String)
    .sort();

  return {
    campaign_key: sample.campaignKey,
    campaign_id: sample.identity.id,
    campaign_name: sample.identity.name,
    client_id: sample.table.client_id,
    table_id: sample.table.id,
    platform: sample.platform,
    goal,
    campaign_objective:
      sample.record.data.campaign_objective ||
      sample.record.data.objective ||
      null,
    optimization_goal: sample.record.data.optimization_goal || null,
    campaign_type_hint: sample.record.data.campaign_type || null,
    result_kind: sample.record.data.result_kind || null,
    delivery_status: deliveryStatus,
    classification_source: sample.source,
    outcome_kind: OUTCOME_KIND_OF_GOAL[reportGoal],
    status: status.status,
    status_tier: status.tier,
    status_reason: status.reason,
    alert_eligible: status.alertEligible,
    ...campaignTargetFields(target, places),
    spend_3d: round(current3.spend),
    outcomes_3d: round(current3.outcomes),
    efficiency_3d: round(efficiency3),
    spend_7d: round(current7.spend),
    outcomes_7d: round(current7.outcomes),
    revenue_7d: round(current7.revenue),
    efficiency_7d: round(efficiency7),
    baseline_efficiency_3d: round(baselineEfficiency3),
    baseline_efficiency_7d: round(baselineEfficiency7),
    baseline_outcomes: round(baselineGuard.outcomes),
    baseline_days: baselineGuard.days,
    trend_3d_pct: round(
      pct(efficiency3, baselineEfficiency3, lowerIsBetter),
      1,
    ),
    trend_7d_pct: round(
      pct(efficiency7, baselineEfficiency7, lowerIsBetter),
      1,
    ),
    impressions_7d: round(current7.impressions),
    clicks_7d: round(current7.clicks),
    ctr_7d: round(
      current7.impressions > 0
        ? (current7.clicks / current7.impressions) * 100
        : null,
    ),
    new_followers_7d: round(current7.newFollowers),
    reach_7d: round(current7.reach),
    frequency_7d: round(current7.frequency),
    spend_today: round(today.spend),
    outcomes_today: round(today.outcomes),
    revenue_today: round(today.revenue),
    efficiency_today: round(efficiencyToday),
    data_fresh_through: today.freshest || current7.freshest,
    last_change_at: lastChangeCandidates.at(-1) || null,
    last_sync_at: settings.last_sync_at || null,
    partial_today_excluded: true,
    today_partial_included: Boolean(today.freshest),
  };
}

/** What a campaign's results are, by its report goal; traffic has none. */
const OUTCOME_KIND_OF_GOAL = {
  ecommerce: "purchases",
  leads: "leads",
  traffic: null,
};
