/**
 * Pulse targets stored in crm_tables.integration_settings (AIO-236).
 *
 * Where they live (most specific first):
 *   pulse_targets[campaignId | campaignName]   one campaign (legacy alias: campaign_targets)
 *   pulse_platform_targets[goal | "default"]    every campaign of that goal in the table
 *   pulse_targets.default                       legacy table-wide default
 *   target_roas / target_cpa / target_cpl / target_cost_per_result   legacy table fields
 *
 * Each entry may carry a source: "approved" (default; set by a person) or
 * "carmen_market" (Carmen's estimate from Israeli vertical benchmarks and the client's
 * own history, with rationale and set_at). A carmen_market target alerts like an
 * approved one, but every reason says it is Carmen's market estimate. Carmen may write
 * one only where no approved target applies; a person replaces it by saving an
 * approved target in the same place.
 *
 * Which target applies: an approved target at any level beats a market estimate at
 * any level (a person's decision always wins over Carmen's estimate, even one set
 * later at the platform level). Among targets of the same source the most specific
 * level wins whole (campaign → platform → pulse_targets.default → table fields). A
 * campaign merged from several report tables (duplicate Meta tables) is resolved over
 * all of them (resolvePulseTargetAcross); between tables at the same level the most
 * recently set target wins, then the lowest table id, so every caller gets the same
 * target whatever order it passes the tables in.
 *
 * Plain ESM so the Deno functions and the Vite dashboard run the same rules.
 */

export const PULSE_TARGET_SOURCES = Object.freeze([
  "approved",
  "carmen_market",
]);

const TARGET_KINDS_BY_GOAL = Object.freeze({
  ecommerce: ["roas", "cpa"],
  leads: ["cpl"],
  engagement: ["cost_per_result"],
});

const TARGET_DIRECTION = Object.freeze({
  roas: "minimum",
  cpa: "maximum",
  cpl: "maximum",
  cost_per_result: "maximum",
});

export function normalizeTargetSource(raw) {
  return String(raw || "").trim() === "carmen_market"
    ? "carmen_market"
    : "approved";
}

/** "יעד מאושר" / "יעד שוק (כרמן)" — shown wherever a target is named. */
export function pulseTargetSourceLabel(source) {
  return normalizeTargetSource(source) === "carmen_market"
    ? "יעד שוק (כרמן)"
    : "יעד מאושר";
}

export function pulseTargetKindsForGoal(goal) {
  return TARGET_KINDS_BY_GOAL[goal] || [];
}

export function pulseTargetKindLabel(kind) {
  if (kind === "roas") return "ROAS";
  if (kind === "cpa") return "CPA";
  if (kind === "cpl") return "CPL";
  return "עלות לתוצאה";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readKind(entry, kind) {
  if (!isPlainObject(entry)) return null;
  const value = Number(entry[kind] ?? entry[`target_${kind}`]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function targetFromEntry(entry, goal, scope) {
  for (const kind of pulseTargetKindsForGoal(goal)) {
    const value = readKind(entry, kind);
    if (value === null) continue;
    const source = normalizeTargetSource(entry.source);
    return {
      value,
      kind,
      direction: TARGET_DIRECTION[kind],
      source,
      scope,
      rationale:
        source === "carmen_market" && entry.rationale
          ? String(entry.rationale)
          : null,
      set_at: entry.set_at ? String(entry.set_at) : null,
      set_by: entry.set_by ? String(entry.set_by) : null,
    };
  }
  return null;
}

function campaignTargets(settings) {
  const targets = settings.pulse_targets || settings.campaign_targets;
  return isPlainObject(targets) ? targets : {};
}

function campaignSlotKey(campaign) {
  if (!campaign) return null;
  const id = String(campaign.campaignId ?? campaign.campaign_id ?? "").trim();
  if (id) return id;
  const name = String(
    campaign.campaignName ?? campaign.campaign_name ?? "",
  ).trim();
  return name || null;
}

function campaignSlots(campaign) {
  if (!campaign) return [];
  const id = String(campaign.campaignId ?? campaign.campaign_id ?? "").trim();
  const name = String(
    campaign.campaignName ?? campaign.campaign_name ?? "",
  ).trim();
  return [...new Set([id, name])].filter((slot) => slot && slot !== "default");
}

/** The goal a stored campaign entry was written for (older entries carry none). */
function entryGoal(entry) {
  if (!isPlainObject(entry)) return null;
  if (TARGET_KINDS_BY_GOAL[entry.goal]) return entry.goal;
  if (readKind(entry, "roas") !== null || readKind(entry, "cpa") !== null)
    return "ecommerce";
  if (readKind(entry, "cpl") !== null) return "leads";
  if (readKind(entry, "cost_per_result") !== null) return "engagement";
  return null;
}

/** Every valid target for the goal at one table, most specific first. */
function targetsAtPlace(settings, goal, campaign) {
  const s = isPlainObject(settings) ? settings : {};
  const targets = campaignTargets(s);
  const platformTargets = isPlainObject(s.pulse_platform_targets)
    ? s.pulse_platform_targets
    : {};
  return [
    // The readers try the id before the name.
    ...campaignSlots(campaign).map((slot) =>
      targetFromEntry(targets[slot], goal, "campaign"),
    ),
    targetFromEntry(platformTargets[goal], goal, "platform"),
    targetFromEntry(platformTargets.default, goal, "platform"),
    targetFromEntry(targets.default, goal, "default"),
    // Legacy table fields have no source: a person set them in the report settings.
    targetFromEntry(
      {
        roas: s.target_roas,
        cpa: s.target_cpa,
        cpl: s.target_cpl,
        cost_per_result: s.target_cost_per_result,
      },
      goal,
      "table",
    ),
  ].filter(Boolean);
}

const SCOPE_RANK = Object.freeze({
  campaign: 0,
  platform: 1,
  default: 2,
  table: 3,
});

function setAtMs(target) {
  const ms = Date.parse(target.set_at || "");
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function textKey(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Does candidate `a` beat `b`? One order for every caller: approved before market,
 * then the most specific level, then the most recently set, then the lowest table
 * id, campaign id and campaign name (plain code-unit order, the same in Deno and
 * the browser). The order the tables come in never decides.
 */
function outranks(a, b) {
  const source =
    Number(a.target.source !== "approved") -
    Number(b.target.source !== "approved");
  if (source) return source < 0;
  const scope = SCOPE_RANK[a.target.scope] - SCOPE_RANK[b.target.scope];
  if (scope) return scope < 0;
  const aSetAt = setAtMs(a.target);
  const bSetAt = setAtMs(b.target);
  if (aSetAt !== bSetAt) return aSetAt > bSetAt;
  for (const key of ["tableId", "campaignId", "campaignName"]) {
    const x = textKey(a.place[key]);
    const y = textKey(b.place[key]);
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * The target that applies to one campaign merged from several tables (or, without
 * a campaign, to the platform goal of several tables). Every table is read with its
 * own campaign id and name; see the header and outranks() for the order.
 *
 * @param {Array<{
 *   tableId?: string | null,
 *   settings: Record<string, unknown> | null | undefined,
 *   campaignId?: string | null,
 *   campaignName?: string | null,
 * }>} places tables in any order (the result does not depend on it)
 * @param {string} goal leads | ecommerce | engagement
 */
export function resolvePulseTargetAcross(places, goal) {
  let best = null;
  for (const place of places || []) {
    const campaign =
      place.campaignId || place.campaignName
        ? { campaignId: place.campaignId, campaignName: place.campaignName }
        : null;
    const found = targetsAtPlace(place.settings, goal, campaign);
    // Within one table: the most specific approved target, else the most specific
    // market estimate.
    const own =
      found.find((target) => target.source === "approved") || found[0] || null;
    if (!own) continue;
    const candidate = { target: own, place };
    if (!best || outranks(candidate, best)) best = candidate;
  }
  if (!best) return null;
  return {
    ...best.target,
    table_id: best.place.tableId ?? null,
    // The campaign id this table stores it under (duplicate tables differ).
    campaign_id:
      best.target.scope === "campaign" ? (best.place.campaignId ?? null) : null,
  };
}

/**
 * The target that applies to a campaign (or, without one, to the whole platform goal)
 * in one table. Approved beats market; then the most specific place wins whole, so a
 * campaign's own CPA beats the platform's ROAS.
 *
 * @param {Record<string, unknown> | null | undefined} settings crm_tables.integration_settings
 * @param {string} goal leads | ecommerce | engagement
 * @param {{ campaignId?: string | null, campaignName?: string | null } | null} [campaign]
 */
export function resolvePulseTarget(settings, goal, campaign = null) {
  const found = targetsAtPlace(settings, goal, campaign);
  return (
    found.find((target) => target.source === "approved") || found[0] || null
  );
}

function cleanEntry(entry) {
  return Object.fromEntries(
    Object.entries(entry).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

/**
 * New integration_settings with one target written or removed.
 * A slot holds one target: writing replaces the whole slot (kind, value, source and
 * its rationale), so an approved save also drops Carmen's market rationale.
 *
 * @param {Record<string, unknown>} existingSettings
 * @param {{
 *   goal: string,
 *   value: number | null,
 *   kind?: string | null,
 *   source?: "approved" | "carmen_market",
 *   campaignId?: string | null,
 *   campaignName?: string | null,
 *   rationale?: string | null,
 *   setBy?: string | null,
 *   approvedBy?: string | null,
 *   setAt?: string | null,
 * }} input
 */
export function buildPulseTargetPatch(existingSettings, input) {
  const settings = isPlainObject(existingSettings) ? existingSettings : {};
  const kinds = pulseTargetKindsForGoal(input.goal);
  if (!kinds.length) throw new Error(`unsupported pulse goal: ${input.goal}`);
  const kind = input.kind || kinds[0];
  if (!kinds.includes(kind))
    throw new Error(`target kind ${kind} does not fit goal ${input.goal}`);
  const value = input.value === null ? null : Number(input.value);
  const remove = value === null || !Number.isFinite(value) || value <= 0;
  const source = normalizeTargetSource(input.source);
  const entry = remove
    ? null
    : cleanEntry({
        [kind]: value,
        source,
        rationale:
          source === "carmen_market"
            ? String(input.rationale || "").trim()
            : null,
        set_at: input.setAt || new Date().toISOString(),
        set_by: input.setBy || null,
        approved_by: source === "approved" ? input.approvedBy || null : null,
      });

  const slot = campaignSlotKey({
    campaignId: input.campaignId,
    campaignName: input.campaignName,
  });
  if (slot === "default")
    throw new Error("a campaign cannot be named 'default' in pulse_targets");
  if (slot) {
    // Keep a legacy campaign_targets map: the readers fall back to it only when
    // pulse_targets is missing, so the first write carries it over.
    const targets = { ...campaignTargets(settings) };
    // The readers try the id before the name, so an entry under the name is stale
    // once the id holds one, and removing must clear both.
    const name = String(input.campaignName || "").trim();
    if (name && name !== slot && name !== "default") delete targets[name];
    if (remove) delete targets[slot];
    else targets[slot] = { ...entry, goal: input.goal };
    return { ...settings, pulse_targets: targets };
  }

  const platformTargets = {
    ...(isPlainObject(settings.pulse_platform_targets)
      ? settings.pulse_platform_targets
      : {}),
  };
  if (remove) {
    // Remove this goal's target fields and the source metadata that described them.
    const next = { ...(platformTargets[input.goal] || {}) };
    for (const k of kinds) {
      delete next[k];
      delete next[`target_${k}`];
    }
    const hasTarget = kinds.some((k) => readKind(next, k) !== null);
    if (!hasTarget) delete platformTargets[input.goal];
    else platformTargets[input.goal] = next;
  } else {
    platformTargets[input.goal] = entry;
  }
  return { ...settings, pulse_platform_targets: platformTargets };
}

/**
 * May Carmen write a market target here? Never where an approved target applies:
 * at campaign level an approved campaign, platform, default or table target blocks
 * it (approved beats market at any level, see resolvePulseTarget), and so does an
 * approved entry stored under the campaign's id or name for any goal, because a
 * write replaces that slot whole. At platform level an approved platform, default
 * or table target blocks it. Carmen may replace her own earlier estimate.
 */
export function canSetMarketTarget(settings, goal, campaign = null) {
  if (!pulseTargetKindsForGoal(goal).length)
    return { ok: false, reason: "unsupported_goal", existing: null };
  const targets = campaignTargets(isPlainObject(settings) ? settings : {});
  for (const slot of campaignSlots(campaign)) {
    const entry = targets[slot];
    if (!isPlainObject(entry)) continue;
    if (normalizeTargetSource(entry.source) !== "approved") continue;
    const goalOfEntry = entryGoal(entry);
    const existing =
      goalOfEntry && targetFromEntry(entry, goalOfEntry, "campaign");
    if (existing)
      return { ok: false, reason: "approved_target_exists", existing };
  }
  const existing = resolvePulseTarget(settings, goal, campaign);
  if (existing && existing.source === "approved")
    return { ok: false, reason: "approved_target_exists", existing };
  return { ok: true, reason: null, existing };
}

const COST_GOALS = new Set(["leads", "ecommerce"]);

/**
 * Campaigns that spent money in the last 7 days and have no target of any source,
 * grouped by client and platform. Only lead and ecommerce campaigns are listed: they
 * are the ones a CPL / CPA / ROAS target is set for.
 *
 * @param {{ campaignRows: Array<Record<string, any>>, tables: Array<{ id: string, client_id: string, integration_settings?: Record<string, unknown> | null }> }} input
 */
export function listCampaignsWithoutTarget({ campaignRows = [], tables = [] }) {
  const settingsById = new Map(
    tables.map((table) => [table.id, table.integration_settings || {}]),
  );
  const groups = new Map();
  for (const row of campaignRows) {
    if (!COST_GOALS.has(row.goal)) continue;
    if (!((Number(row.spend_7d) || 0) > 0)) continue;
    if (row.delivery_status === "paused" || row.delivery_status === "removed")
      continue;
    // The pulse row resolved its target over every table the campaign is read
    // from; a stored snapshot can be older than a target set since, so the row's
    // own table is read again as well.
    if (row.target_value !== null && row.target_value !== undefined) continue;
    const settings = settingsById.get(row.table_id);
    if (!settings) continue;
    const target = resolvePulseTarget(settings, row.goal, {
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
    });
    if (target) continue;
    const key = `${row.client_id}:${row.platform}`;
    const group = groups.get(key) || {
      client_id: row.client_id,
      platform: row.platform,
      spend_7d: 0,
      campaigns: [],
    };
    group.spend_7d += Number(row.spend_7d) || 0;
    group.campaigns.push({
      campaign_key: row.campaign_key,
      campaign_id: row.campaign_id ?? null,
      campaign_name: row.campaign_name,
      table_id: row.table_id,
      goal: row.goal,
      spend_7d: Number(row.spend_7d) || 0,
      efficiency_7d: row.efficiency_7d ?? null,
    });
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      spend_7d: Math.round(group.spend_7d * 100) / 100,
      campaigns: group.campaigns.sort((a, b) => b.spend_7d - a.spend_7d),
    }))
    .sort((a, b) => b.spend_7d - a.spend_7d);
}

/**
 * Targets per client for Carmen's get_pulse_targets: what is set (with source,
 * rationale and date) and which spending campaigns have none.
 *
 * @param {{ tables: Array<Record<string, any>>, campaignRows: Array<Record<string, any>> }} input
 */
export function summarizePulseTargets({ tables = [], campaignRows = [] }) {
  const byClient = new Map();
  const ensure = (clientId) => {
    const entry = byClient.get(clientId) || {
      client_id: clientId,
      platform_targets: [],
      campaign_targets: [],
    };
    byClient.set(clientId, entry);
    return entry;
  };
  for (const table of tables) {
    const settings = table.integration_settings || {};
    const platform =
      table.integration_type === "google_ads"
        ? "google"
        : table.integration_type === "facebook_insights" ||
            table.integration_type === "facebook_ecommerce"
          ? "meta"
          : null;
    if (!platform) continue;
    const client = ensure(table.client_id);
    for (const goal of ["leads", "ecommerce", "engagement"]) {
      const target = resolvePulseTarget(settings, goal, null);
      if (target)
        client.platform_targets.push({
          table_id: table.id,
          platform,
          goal,
          ...target,
        });
    }
    for (const [slot, entry] of Object.entries(campaignTargets(settings))) {
      if (slot === "default" || !isPlainObject(entry)) continue;
      const goal = entryGoal(entry);
      if (!goal) continue;
      const target = targetFromEntry(entry, goal, "campaign");
      if (target)
        client.campaign_targets.push({
          table_id: table.id,
          platform,
          campaign: slot,
          goal,
          ...target,
        });
    }
  }
  const missing = listCampaignsWithoutTarget({ campaignRows, tables });
  for (const group of missing) ensure(group.client_id);
  return {
    clients: [...byClient.values()].map((client) => ({
      ...client,
      missing: missing.filter((group) => group.client_id === client.client_id),
    })),
    missing_count: missing.reduce(
      (total, group) => total + group.campaigns.length,
      0,
    ),
  };
}
