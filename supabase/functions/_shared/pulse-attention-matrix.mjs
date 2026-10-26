import {
  integrationTypeToGoal,
  isEcommerceReportTable,
  tableReportGoal,
} from "./pulse-campaign-goals.mjs";
import {
  buildPulseTargetPatch,
  pulseTargetKindsForGoal,
  pulseTargetSourceLabel,
  resolvePulseTarget,
} from "./pulse-targets.mjs";

const MOOD_STATUS_LABELS = {
  happy: "😊 מבסוט / תקין",
  wavering: "😐 מתנדנד / רגיש",
  churn_risk: "😟 סכנת נטישה / תלונה",
  not_progressing: "😔 לא מתקדם",
  normal: "😊 מבסוט / תקין",
  sensitive: "😐 מתנדנד / רגיש",
  complaint: "😟 סכנת נטישה / תלונה",
};

const MS_PER_DAY = 86_400_000;

function daysSince(iso) {
  if (!iso) return null;
  const parsed = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / MS_PER_DAY);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function platformTablesForClient(tables, clientId, platform) {
  return tables.filter((table) => {
    if (table.client_id !== clientId) return false;
    if (platform === "google") return table.integration_type === "google_ads";
    return (
      table.integration_type === "facebook_insights" ||
      table.integration_type === "facebook_ecommerce"
    );
  });
}

function platformConfiguredGoal(tables, clientId, platform) {
  const matches = platformTablesForClient(tables, clientId, platform);
  const goals = new Set(
    matches
      .map(
        (table) =>
          tableReportGoal(table) ||
          integrationTypeToGoal(table.integration_type, table),
      )
      .filter(Boolean),
  );
  if (goals.size === 1) return [...goals][0];
  if (matches.length && !matches.some((table) => isEcommerceReportTable(table)))
    return "leads";
  return null;
}

function rowConfirmsSalesObjective(row) {
  const objective = String(row.campaign_objective || row.objective || "")
    .trim()
    .toUpperCase();
  return (
    objective.includes("OUTCOME_SALES") ||
    objective.includes("PRODUCT_CATALOG") ||
    objective.includes("PURCHASE")
  );
}

function effectiveCampaignGoal(row, table) {
  if (!table || row.goal !== "ecommerce") return row.goal;
  if (isEcommerceReportTable(table)) return row.goal;
  if (rowConfirmsSalesObjective(row)) return "ecommerce";
  // A Google campaign whose goal came from its own conversion goal (or a manual
  // mapping) is a sales campaign even inside a leads report.
  if (
    table.integration_type === "google_ads" &&
    ["platform_goal", "explicit_mapping"].includes(row.classification_source)
  )
    return "ecommerce";
  return "leads";
}

function normalizeAttentionRows(rows, tableById) {
  return rows.map((row) => {
    const table = tableById.get(row.table_id);
    const goal = effectiveCampaignGoal(row, table);
    if (goal === row.goal) return row;
    const efficiency7d =
      goal === "ecommerce"
        ? row.spend_7d > 0 && row.revenue_7d
          ? row.revenue_7d / row.spend_7d
          : row.efficiency_7d
        : row.outcomes_7d > 0 && row.spend_7d
          ? row.spend_7d / row.outcomes_7d
          : row.efficiency_7d;
    return {
      ...row,
      goal,
      efficiency_7d: efficiency7d ?? row.efficiency_7d,
    };
  });
}

function goalFromRows(rows, configuredGoal = null) {
  const counts = new Map();
  for (const row of rows) {
    if (row.goal === "unknown") continue;
    counts.set(row.goal, (counts.get(row.goal) ?? 0) + (row.spend_7d ?? 0));
  }
  let best = "leads";
  let bestSpend = -1;
  for (const [goal, spend] of counts) {
    if (spend > bestSpend) {
      best = goal;
      bestSpend = spend;
    }
  }
  if (configuredGoal === "leads" && (counts.get("leads") ?? 0) > 0)
    return "leads";
  // Rows are already normalized: ecommerce rows left in a leads report are
  // confirmed sales campaigns, so a platform with only those is measured on ROAS.
  if (configuredGoal === "leads" && best === "ecommerce" && counts.size === 1)
    return "ecommerce";
  if (configuredGoal === "leads" && best === "ecommerce") return "leads";
  if (configuredGoal && configuredGoal !== "unknown") return configuredGoal;
  if (bestSpend >= 0) return best;
  return rows.find((row) => row.goal !== "unknown")?.goal ?? "leads";
}

function rowsForGoal(rows, goal) {
  return rows.filter((row) => row.goal === goal);
}

function aggregatePlatformMetrics(rows, configuredGoal = null) {
  const primaryGoal = goalFromRows(rows, configuredGoal);
  const goalRows = rowsForGoal(rows, primaryGoal);
  const scopedRows = goalRows.length ? goalRows : rows;

  let spend7d = 0;
  let outcomes7d = 0;
  let hasOutcomes = false;
  let revenue7d = 0;
  let trendWeighted = 0;
  let trendWeight = 0;
  let baselineWeighted = 0;
  let baselineWeight = 0;
  let lastChangeAt = null;

  for (const row of scopedRows) {
    spend7d += row.spend_7d ?? 0;
    if (row.outcomes_7d !== null && row.outcomes_7d !== undefined) {
      outcomes7d += row.outcomes_7d;
      hasOutcomes = true;
    }
    revenue7d += row.revenue_7d ?? 0;
    if (row.trend_7d_pct !== null && row.spend_7d > 0) {
      trendWeighted += row.trend_7d_pct * row.spend_7d;
      trendWeight += row.spend_7d;
    }
    const baseline = row.baseline_efficiency_7d;
    if (baseline !== null && baseline !== undefined && row.spend_7d > 0) {
      baselineWeighted += baseline * row.spend_7d;
      baselineWeight += row.spend_7d;
    }
    if (
      row.last_change_at &&
      (!lastChangeAt || row.last_change_at > lastChangeAt)
    ) {
      lastChangeAt = row.last_change_at;
    }
  }

  const useRoas = primaryGoal === "ecommerce";
  const efficiency7d = useRoas
    ? spend7d > 0
      ? revenue7d / spend7d
      : null
    : hasOutcomes && outcomes7d > 0
      ? spend7d / outcomes7d
      : null;

  return {
    primaryGoal,
    spend7d,
    efficiency7d: efficiency7d === null ? null : round(efficiency7d),
    trend7dPct: trendWeight > 0 ? round(trendWeighted / trendWeight, 1) : null,
    baselineEfficiency7d:
      baselineWeight > 0 ? round(baselineWeighted / baselineWeight) : null,
    lastChangeAt,
  };
}

/**
 * The platform-level target for a goal: approved or Carmen's market estimate.
 * There is no 30-day-baseline "target" any more: the snapshot never had one, and
 * a campaign without a target is judged by the shared cost rules instead.
 */
export function readPlatformTarget(settings = {}, goal) {
  return resolvePulseTarget(settings || {}, goal, null);
}

/** Only a target a person approved (legacy name kept for callers). */
export function readApprovedPlatformTarget(settings = {}, goal) {
  const target = readPlatformTarget(settings, goal);
  return target && target.source === "approved" ? target : null;
}

/** Kept for callers; the baseline argument is ignored (see readPlatformTarget). */
export function resolvePlatformTarget(settings, goal, _baselineEfficiency7d) {
  return readPlatformTarget(settings, goal);
}

const STATUS_RANK = { exception: 2, watch: 1 };

/**
 * The efficiency cell of a client × platform, taken from its campaign rows. Each row
 * was classified by buildPulseCampaignRows with the tenant's cost rules — the same
 * classification the snapshot stores and alerts on — so the dashboard turns red
 * exactly when a WhatsApp alert is due (alert_eligible), and shows an exception that
 * does not alert (a campaign without a target while those alerts are off) as watch.
 */
export function evaluateEfficiencyIssue({ campaignRows = [] } = {}) {
  const flagged = campaignRows
    .filter(
      (row) =>
        (row.status === "critical" && row.status_tier === "exception") ||
        (row.status === "warning" && row.status_tier === "watch"),
    )
    .sort(
      (a, b) =>
        Number(b.alert_eligible === true) - Number(a.alert_eligible === true) ||
        (STATUS_RANK[b.status_tier] ?? 0) - (STATUS_RANK[a.status_tier] ?? 0) ||
        (b.spend_7d ?? 0) - (a.spend_7d ?? 0),
    );
  if (!flagged.length) return null;
  const worst = flagged[0];
  const more = flagged.length > 1 ? ` (+${flagged.length - 1} קמפיינים)` : "";
  const name = worst.campaign_name ? `${worst.campaign_name}: ` : "";
  const silentException =
    worst.status_tier === "exception" && worst.alert_eligible !== true;
  return {
    level: worst.alert_eligible === true ? "alert" : "watch",
    label: `${name}${worst.status_reason || "חריגה"}${silentException ? " · בלי התראה (התראות ללא יעד כבויות)" : ""}${more}`,
  };
}

function evaluateCampaignTouchIssue(lastChangeAt, spend7d, hasEfficiencyIssue) {
  if (spend7d <= 0) return null;
  const days = daysSince(lastChangeAt);
  if (days === null)
    return hasEfficiencyIssue
      ? { level: "watch", label: "אין תיעוד מגע בקמפיין" }
      : null;
  if (days >= 7)
    return { level: "alert", label: `${days} ימים ללא מגע בקמפיין` };
  if (days >= 3 && hasEfficiencyIssue)
    return { level: "watch", label: `${days} ימים ללא מגע + ירידה בביצועים` };
  return null;
}

function evaluateLastCommunicationIssue(
  daysSinceLastCommunication,
  lastClientCallAt,
) {
  const days = daysSinceLastCommunication ?? daysSince(lastClientCallAt);
  if (days === null)
    return { level: "watch", label: "אין תיעוד שיחה עם הלקוח" };
  if (days >= 45) return { level: "alert", label: `${days} ימים ללא תקשורת` };
  if (days >= 30) return { level: "watch", label: `${days} ימים ללא תקשורת` };
  return null;
}

function evaluateComplaintIssue({
  recentCommunicationStatus,
  hasRecentComplaintUpdate,
}) {
  if (recentCommunicationStatus === "complaint" || hasRecentComplaintUpdate)
    return { level: "alert", label: "תלונה / עדכון רגיש" };
  if (recentCommunicationStatus === "sensitive")
    return { level: "watch", label: "עדכון רגיש" };
  return null;
}

function evaluateSatisfactionIssue(moodStatus) {
  if (!moodStatus || moodStatus === "happy" || moodStatus === "normal")
    return null;
  const label = MOOD_STATUS_LABELS[moodStatus] ?? moodStatus;
  if (moodStatus === "churn_risk" || moodStatus === "complaint")
    return { level: "alert", label };
  return { level: "watch", label };
}

function pickPrimaryTable(tables, platform, goal) {
  const matches = tables.filter((table) => {
    if (platform === "google") return table.integration_type === "google_ads";
    return (
      table.integration_type === "facebook_insights" ||
      table.integration_type === "facebook_ecommerce"
    );
  });
  if (!matches.length) return null;
  if (platform === "google") return matches[0];
  if (goal === "ecommerce") {
    return (
      matches.find(
        (table) => table.integration_type === "facebook_ecommerce",
      ) ?? matches[0]
    );
  }
  return (
    matches.find((table) => table.integration_type === "facebook_insights") ??
    matches[0]
  );
}

function rowHasIssue(issues) {
  return Object.values(issues).some((issue) => issue && issue.level !== "ok");
}

export function buildPulseAttentionRows({
  campaignRows = [],
  tables = [],
  clients = [],
}) {
  const clientMap = new Map(clients.map((client) => [client.clientId, client]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const tablesByClient = new Map();
  for (const table of tables) {
    const list = tablesByClient.get(table.client_id) ?? [];
    list.push(table);
    tablesByClient.set(table.client_id, list);
  }

  const grouped = new Map();
  for (const row of campaignRows) {
    if (row.platform !== "meta" && row.platform !== "google") continue;
    const key = `${row.client_id}:${row.platform}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const result = [];
  for (const [key, rows] of grouped) {
    const [clientId, platform] = key.split(":");
    const client = clientMap.get(clientId);
    if (!client) continue;

    const configuredGoal = platformConfiguredGoal(tables, clientId, platform);
    const normalizedRows = normalizeAttentionRows(rows, tableById);
    const metrics = aggregatePlatformMetrics(normalizedRows, configuredGoal);
    if (metrics.spend7d <= 0) continue;

    const primaryTable = pickPrimaryTable(
      tablesByClient.get(clientId) ?? [],
      platform,
      metrics.primaryGoal,
    );
    const settings = primaryTable?.integration_settings || {};
    const target = readPlatformTarget(settings, metrics.primaryGoal);
    const efficiencyIssue = evaluateEfficiencyIssue({ campaignRows: rows });

    const issues = {
      campaignTouch: evaluateCampaignTouchIssue(
        metrics.lastChangeAt,
        metrics.spend7d,
        Boolean(efficiencyIssue),
      ),
      efficiency: efficiencyIssue,
      lastCommunication: evaluateLastCommunicationIssue(
        client.daysSinceLastCommunication,
        client.lastClientCallAt,
      ),
      complaintUpdate: evaluateComplaintIssue({
        recentCommunicationStatus: client.recentCommunicationStatus,
        hasRecentComplaintUpdate: client.hasRecentComplaintUpdate,
      }),
      satisfaction: evaluateSatisfactionIssue(client.moodStatus),
    };

    if (!rowHasIssue(issues)) continue;

    result.push({
      clientId,
      clientName: client.clientName,
      campaignerName: client.campaignerName,
      platform,
      tableId: primaryTable?.id ?? null,
      primaryGoal: metrics.primaryGoal,
      target,
      currentEfficiency: metrics.efficiency7d,
      baselineEfficiency7d: metrics.baselineEfficiency7d,
      spend7d: metrics.spend7d,
      issues,
      hasAnyIssue: true,
    });
  }

  return result.sort(
    (a, b) =>
      String(a.clientName).localeCompare(String(b.clientName), "he") ||
      String(a.platform).localeCompare(String(b.platform)),
  );
}

export function platformTargetFieldKey(goal) {
  return pulseTargetKindsForGoal(goal)[0] || "cpl";
}

/** Platform-level save from the dashboard: always an approved target. */
export function buildPlatformTargetPatch(
  existingSettings = {},
  goal,
  value,
  meta = {},
) {
  return buildPulseTargetPatch(existingSettings, {
    goal,
    value,
    kind: platformTargetFieldKey(goal),
    source: "approved",
    setBy: meta.setBy ?? null,
  });
}

export { pulseTargetSourceLabel };
