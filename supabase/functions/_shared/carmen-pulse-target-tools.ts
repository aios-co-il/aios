/**
 * Carmen's pulse-target tools (AIO-236). Plain TypeScript, no Deno APIs, so the
 * rules run under node tests; run-ai-agent only registers and dispatches them.
 *
 * - get_pulse_targets: what each client has (source, rationale, date) and which
 *   spending campaigns have no target.
 * - set_market_target: Carmen writes her own market estimate ("יעד שוק (כרמן)")
 *   where no approved target applies. It alerts like an approved one. She never
 *   overwrites a target a person approved.
 * - set_pulse_target: an approved target for a human requester, queued in
 *   agent_approval_queue; carmen-approval-execute applies it with
 *   applyApprovedPulseTarget.
 *
 * The agent runs with the service role, so every call checks client access first.
 */
import {
  buildPulseTargetPatch,
  canSetMarketTarget,
  pulseTargetKindLabel,
  pulseTargetKindsForGoal,
  resolvePulseTarget,
  summarizePulseTargets,
} from "./pulse-targets.mjs";

// deno-lint-ignore no-explicit-any
type Db = any;

export const PULSE_TARGET_TOOL_NAMES = [
  "get_pulse_targets",
  "set_market_target",
  "set_pulse_target",
] as const;

type PulseTargetToolName = (typeof PULSE_TARGET_TOOL_NAMES)[number];

const PLATFORM_TYPES: Record<string, string[]> = {
  meta: ["facebook_insights", "facebook_ecommerce"],
  google: ["google_ads"],
};
const AD_TYPES = [...PLATFORM_TYPES.meta, ...PLATFORM_TYPES.google];
const TARGET_GOALS = ["leads", "ecommerce"];
const MIN_RATIONALE_CHARS = 30;
/** A market estimate must stay within this share of the client's own 7-day baseline. */
const MARKET_TARGET_MAX_DEVIATION = 0.5;
/**
 * Roles that may set targets (the people who can edit report tables in the UI).
 * A caller with no role (an automation, Carmen on her own) may still set a market
 * target; set_pulse_target always needs a person.
 */
const TARGET_WRITER_ROLES = new Set([
  "super_admin",
  "owner",
  "agency_owner",
  "agency_manager",
  "team_manager",
  "campaigner",
]);
const MAX_CLIENTS_RETURNED = 40;
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

const targetParams = {
  client_id: { type: "string", description: "מזהה הלקוח" },
  platform: {
    type: "string",
    enum: ["meta", "google"],
    description: "meta (פייסבוק/אינסטגרם) או google (Google Ads)",
  },
  goal: {
    type: "string",
    enum: TARGET_GOALS,
    description: "leads → CPL; ecommerce → ROAS או CPA",
  },
  kind: {
    type: "string",
    enum: ["cpl", "roas", "cpa"],
    description: "סוג היעד. ללידים תמיד cpl; לאיקומרס roas (ברירת מחדל) או cpa",
  },
  value: {
    type: "number",
    description: "ערך היעד: ₪ ל־CPL/CPA, יחס ל־ROAS (למשל 3 = פי 3)",
  },
  campaign_id: {
    type: "string",
    description:
      "מזהה קמפיין ליעד של קמפיין אחד. בלי — יעד לכל קמפייני המטרה בפלטפורמה",
  },
};

export const PULSE_TARGET_TOOLS = [
  {
    name: "get_pulse_targets",
    description:
      "יעדי הדופק של לקוחות: יעד לפלטפורמה ויעדים לקמפיינים, עם המקור (מאושר / יעד שוק (כרמן)), הנימוק והתאריך, ורשימת הקמפיינים שמוציאים כסף בלי שום יעד. בלי client_id — כל הלקוחות בהרשאה שלך.",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "מזהה לקוח (לא חובה)" },
      },
    },
  },
  {
    name: "set_market_target",
    description:
      "קביעת יעד שוק (כרמן) — הערכה שלך ליעד CPL / CPA / ROAS לקמפיין או לפלטפורמה שאין להם יעד מאושר. היעד חייב להתבסס גם על בנצ׳מרקים של הענף של הלקוח בשוק הישראלי וגם על ההיסטוריה של הלקוח עצמו (הביצועים בדופק), והנימוק (rationale) חייב לציין את שניהם עם מספרים. הערך חייב להיות בטווח של ±50% מהבסיס של הלקוח ב־4 השבועות האחרונים; יעד רחוק יותר יתריע מיד, ולכן מציעים אותו למשתמש עם set_pulse_target. לא דורס יעד מאושר שאדם קבע — אם יש כזה הכלי מסרב. יעד לקמפיין: רק לקמפיין שמופיע בדופק האחרון, ורק למטרה שלפיה הוא נמדד. יעד שוק מפעיל התראות כמו יעד מאושר, וההתראה מציינת שזה יעד שוק של כרמן. אם המשתמש עצמו רוצה לקבוע יעד — set_pulse_target.",
    parameters: {
      type: "object",
      properties: {
        ...targetParams,
        rationale: {
          type: "string",
          description:
            "נימוק בעברית: הבנצ׳מרק בענף בישראל (טווח ומקור) וההיסטוריה של הלקוח (למשל CPL ממוצע ב־4 השבועות האחרונים)",
        },
      },
      required: ["client_id", "platform", "goal", "value", "rationale"],
    },
  },
  {
    name: "set_pulse_target",
    description:
      'יעד מאושר (CPL / CPA / ROAS) לקמפיין או לפלטפורמה של לקוח, לבקשת המשתמש. נכנס לתור האישורים: הציגי את השינוי ובקשי אישור, ורק אחרי "כן" — execute_pending_approval. מחליף גם יעד שוק שכרמן קבעה.',
    parameters: {
      type: "object",
      properties: {
        ...targetParams,
        note: { type: "string", description: "הערה לאישור (לא חובה)" },
      },
      required: ["client_id", "platform", "goal", "value"],
    },
  },
];

export function isPulseTargetTool(name: string): name is PulseTargetToolName {
  return (PULSE_TARGET_TOOL_NAMES as readonly string[]).includes(name);
}

export type PulseTargetToolContext = {
  tenantId: string;
  accessibleTenantIds: string[];
  /** The person behind this request; null for automations and scheduled runs. */
  actorUserId: string | null;
  agentId: string | null;
  callerRole: string | null;
  callerPhone: string | null;
  isManagerRole: boolean;
  isTeamManager: boolean;
  managedAgencyIds: string[];
  callerCampaignerId: string | null;
  assertClientAccess: (clientId: string) => Promise<void>;
  now?: () => Date;
};

type TargetInput = {
  clientId: string;
  platform: "meta" | "google";
  goal: "leads" | "ecommerce";
  kind: string;
  value: number;
  campaignId: string | null;
};

function parseTargetInput(
  args: Record<string, unknown>,
): TargetInput | { error: string } {
  const clientId = String(args.client_id ?? "").trim();
  if (!clientId) return { error: "client_id נדרש" };
  const platform = String(args.platform ?? "").trim();
  if (platform !== "meta" && platform !== "google")
    return { error: "platform חייב להיות meta או google" };
  const goal = String(args.goal ?? "").trim();
  if (goal !== "leads" && goal !== "ecommerce")
    return { error: "goal חייב להיות leads או ecommerce" };
  const kinds = pulseTargetKindsForGoal(goal);
  const kind = String(args.kind ?? "").trim() || kinds[0];
  if (!kinds.includes(kind as never))
    return {
      error: `סוג יעד ${kind} לא מתאים למטרה ${goal} (אפשר: ${kinds.join(", ")})`,
    };
  const value = Number(args.value);
  if (!Number.isFinite(value) || value <= 0)
    return { error: "value חייב להיות מספר חיובי" };
  const campaignId = String(args.campaign_id ?? "").trim() || null;
  return { clientId, platform, goal, kind, value, campaignId };
}

async function loadPlatformTables(
  supabase: Db,
  ctx: PulseTargetToolContext,
  clientId: string,
  platform: "meta" | "google",
) {
  const { data, error } = await supabase
    .from("crm_tables")
    .select("id, client_id, tenant_id, integration_type, integration_settings")
    .eq("client_id", clientId)
    .in("tenant_id", ctx.accessibleTenantIds)
    .in("integration_type", PLATFORM_TYPES[platform]);
  if (error) throw error;
  return (data || []) as Array<{
    id: string;
    client_id: string;
    integration_type: string;
    integration_settings: Record<string, unknown> | null;
  }>;
}

/** campaign_breakdown rows of the freshest snapshot of each client. */
async function latestCampaignRows(
  supabase: Db,
  ctx: PulseTargetToolContext,
  clientIds: string[],
) {
  if (!clientIds.length) return [];
  const { data, error } = await supabase
    .from("campaign_pulse_snapshots")
    .select("client_id, calculated_at, campaign_breakdown")
    .in("client_id", clientIds.slice(0, 500))
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("calculated_at", { ascending: false });
  if (error) return [];
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const snapshot of data || []) {
    if (seen.has(snapshot.client_id)) continue;
    seen.add(snapshot.client_id);
    if (Array.isArray(snapshot.campaign_breakdown))
      rows.push(...snapshot.campaign_breakdown);
  }
  return rows;
}

type PulseCampaignMatch = {
  campaignId: string;
  campaignName: string | null;
  tableId: string | null;
  goal: string | null;
  targetSource: string | null;
  targetValue: number | null;
  targetKind: string | null;
  targetScope: string | null;
};

/** The campaign as the latest pulse sees it (name, table, goal and its target). */
function matchCampaign(
  rows: Array<Record<string, unknown>>,
  input: TargetInput,
): PulseCampaignMatch | null {
  if (!input.campaignId) return null;
  const match = rows.find(
    (row) =>
      String(row.campaign_id ?? "") === input.campaignId &&
      row.platform === input.platform,
  );
  if (!match) return null;
  const text = (value: unknown) => (value ? String(value) : null);
  const targetValue = Number(match.target_value);
  return {
    campaignId: input.campaignId,
    campaignName: text(match.campaign_name),
    tableId: text(match.table_id),
    goal: text(match.goal),
    targetSource: text(match.target_source),
    targetValue:
      match.target_value != null && Number.isFinite(targetValue)
        ? targetValue
        : null,
    targetKind: text(match.target_kind),
    targetScope: text(match.target_scope),
  };
}

const GOAL_LABELS: Record<string, string> = {
  leads: "לידים",
  ecommerce: "איקומרס",
  engagement: "אינגייג׳מנט",
};

/** A campaign target needs the campaign in the latest pulse, measured on this goal. */
function campaignProblem(
  input: TargetInput,
  campaign: PulseCampaignMatch | null,
): { error: string; message: string } | null {
  if (!input.campaignId) return null;
  if (!campaign)
    return {
      error: "campaign_not_in_pulse",
      message:
        "הקמפיין לא מופיע בדופק האחרון של הלקוח בפלטפורמה הזו. בדקי את campaign_id ב־get_pulse_targets, או קבעי יעד לפלטפורמה.",
    };
  if (campaign.goal && campaign.goal !== input.goal)
    return {
      error: "goal_mismatch",
      message: `הדופק מודד את הקמפיין כ${GOAL_LABELS[campaign.goal] || "לא מסווג"}, לא כ${GOAL_LABELS[input.goal]}. יעד נקבע רק למטרה שלפיה הקמפיין נמדד.`,
    };
  return null;
}

function roleProblem(
  ctx: PulseTargetToolContext,
): { error: string; message: string } | null {
  if (!ctx.callerRole || TARGET_WRITER_ROLES.has(ctx.callerRole)) return null;
  return {
    error: "role_not_allowed",
    message:
      "רק מנהלים וקמפיינרים קובעים יעדי דופק. אפשר להציג את היעדים עם get_pulse_targets.",
  };
}

/**
 * The client's own 7-day baseline for this target from the latest pulse: the
 * campaign's, or the spend-weighted one of the platform's campaigns of that goal.
 * Only rows measured on the same metric count (an ecommerce row is measured on
 * ROAS unless it has a CPA target). Null when the pulse has none.
 */
function ownBaseline(
  rows: Array<Record<string, unknown>>,
  input: TargetInput,
): number | null {
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.platform !== input.platform || row.goal !== input.goal) continue;
    if (input.campaignId && String(row.campaign_id ?? "") !== input.campaignId)
      continue;
    const measured =
      row.goal === "ecommerce"
        ? row.target_kind === "cpa"
          ? "cpa"
          : "roas"
        : "cpl";
    if (measured !== input.kind) continue;
    const baseline = Number(row.baseline_efficiency_7d);
    const spend = Number(row.spend_7d);
    if (!(baseline > 0) || !(spend > 0)) continue;
    weighted += baseline * spend;
    weight += spend;
  }
  return weight > 0 ? weighted / weight : null;
}

async function clientName(supabase: Db, clientId: string) {
  const { data } = await supabase
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();
  return (data?.name as string | undefined) || "לקוח";
}

async function scopedClientIds(
  supabase: Db,
  ctx: PulseTargetToolContext,
): Promise<string[] | null | { error: string }> {
  if (ctx.isManagerRole) return null;
  if (ctx.isTeamManager && ctx.managedAgencyIds.length) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .in("agency_id", ctx.managedAgencyIds)
      .in("tenant_id", ctx.accessibleTenantIds);
    if (error) throw error;
    return (data || []).map((row: { id: string }) => row.id);
  }
  if (ctx.callerCampaignerId) {
    const { data, error } = await supabase
      .from("client_team")
      .select("client_id")
      .eq("campaigner_id", ctx.callerCampaignerId);
    if (error) throw error;
    return [
      ...new Set(
        (data || []).map((row: { client_id: string }) => row.client_id),
      ),
    ];
  }
  return { error: "ציינו client_id — אין לך שיוך ללקוחות" };
}

async function getPulseTargets(
  supabase: Db,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
) {
  const requested = String(args.client_id ?? "").trim();
  let clientIds: string[] | null;
  if (requested) {
    await ctx.assertClientAccess(requested);
    clientIds = [requested];
  } else {
    const scoped = await scopedClientIds(supabase, ctx);
    if (scoped && !Array.isArray(scoped)) return scoped;
    clientIds = scoped;
  }
  if (clientIds && !clientIds.length)
    return { clients: [], missing_count: 0, note: "אין לקוחות בהרשאה שלך" };

  let query = supabase
    .from("crm_tables")
    .select("id, client_id, integration_type, integration_settings")
    .in("tenant_id", ctx.accessibleTenantIds)
    .in("integration_type", AD_TYPES)
    .not("client_id", "is", null)
    .limit(1000);
  if (clientIds) query = query.in("client_id", clientIds.slice(0, 500));
  const { data: tables, error } = await query;
  if (error) throw error;
  const tableList = tables || [];
  const ids = [
    ...new Set(tableList.map((t: { client_id: string }) => t.client_id)),
  ] as string[];
  const campaignRows = await latestCampaignRows(supabase, ctx, ids);
  const summary = summarizePulseTargets({ tables: tableList, campaignRows });

  const { data: clients } = ids.length
    ? await supabase
        .from("clients")
        .select("id, name")
        .in("id", ids.slice(0, 500))
    : { data: [] };
  const nameById = new Map(
    (clients || []).map((c: { id: string; name: string }) => [c.id, c.name]),
  );
  const sorted = summary.clients
    .map((client) => ({
      client_name: nameById.get(client.client_id) || null,
      ...client,
    }))
    .sort(
      (a, b) =>
        b.missing.reduce((t, g) => t + g.spend_7d, 0) -
        a.missing.reduce((t, g) => t + g.spend_7d, 0),
    );
  return {
    clients: sorted.slice(0, MAX_CLIENTS_RETURNED),
    clients_total: sorted.length,
    missing_count: summary.missing_count,
    truncated: sorted.length > MAX_CLIENTS_RETURNED,
    sources: {
      approved: "יעד מאושר — אדם קבע",
      carmen_market: "יעד שוק (כרמן) — הערכה של כרמן; מפעיל התראות כמו מאושר",
    },
  };
}

async function setMarketTarget(
  supabase: Db,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
) {
  const parsed = parseTargetInput(args);
  if ("error" in parsed) return parsed;
  const rationale = String(args.rationale ?? "").trim();
  // Both sources must be stated with numbers; a bare opinion is not a market target.
  if (rationale.length < MIN_RATIONALE_CHARS || !/\d/.test(rationale))
    return {
      error: "rationale_required",
      message:
        "נימוק חסר או קצר מדי: ציינו את הבנצ׳מרק של הענף בישראל ואת ההיסטוריה של הלקוח, עם מספרים.",
    };
  const role = roleProblem(ctx);
  if (role) return { success: false, ...role };
  await ctx.assertClientAccess(parsed.clientId);
  const tables = await loadPlatformTables(
    supabase,
    ctx,
    parsed.clientId,
    parsed.platform,
  );
  if (!tables.length)
    return {
      error: "no_campaign_table",
      message: "אין ללקוח טבלת קמפיינים מחוברת בפלטפורמה הזו",
    };
  const rows = await latestCampaignRows(supabase, ctx, [parsed.clientId]);
  const campaign = matchCampaign(rows, parsed);
  const problem = campaignProblem(parsed, campaign);
  if (problem) return { success: false, ...problem };

  const refusal = (existing: unknown) => ({
    success: false,
    error: "approved_target_exists",
    existing,
    message:
      "כבר יש יעד מאושר שאדם קבע — כרמן לא דורסת אותו. אם צריך לשנות, הציעי למשתמש set_pulse_target (באישור).",
  });
  // The pulse resolved the campaign's target over every table it is read from.
  if (campaign?.targetSource === "approved")
    return refusal({
      value: campaign.targetValue,
      kind: campaign.targetKind,
      source: "approved",
      scope: campaign.targetScope,
    });
  // An approved target on any table of this client × platform blocks the whole
  // write: nothing is written unless every table allows it.
  const ref = campaign
    ? { campaignId: campaign.campaignId, campaignName: campaign.campaignName }
    : null;
  for (const table of tables) {
    const allowed = canSetMarketTarget(
      table.integration_settings || {},
      parsed.goal,
      ref,
    );
    if (!allowed.ok)
      return allowed.reason === "approved_target_exists"
        ? { ...refusal(allowed.existing), table_id: table.id }
        : {
            success: false,
            error: allowed.reason || "not_written",
            message: "היעד לא נשמר",
          };
  }

  // A market estimate far from the client's own history would alert at once
  // (or never): that call belongs to a person.
  const baseline = ownBaseline(rows, parsed);
  if (
    baseline !== null &&
    (parsed.value < baseline * (1 - MARKET_TARGET_MAX_DEVIATION) ||
      parsed.value > baseline * (1 + MARKET_TARGET_MAX_DEVIATION))
  ) {
    const low =
      Math.round(baseline * (1 - MARKET_TARGET_MAX_DEVIATION) * 100) / 100;
    const high =
      Math.round(baseline * (1 + MARKET_TARGET_MAX_DEVIATION) * 100) / 100;
    return {
      success: false,
      error: "value_out_of_range",
      baseline: Math.round(baseline * 100) / 100,
      allowed_range: [low, high],
      message: `יעד שוק חייב להיות בטווח של ±50% מהבסיס של הלקוח (${pulseTargetKindLabel(parsed.kind)} ${low}–${high}). יעד רחוק יותר — הציעי אותו למשתמש עם set_pulse_target, באישור.`,
    };
  }

  // A campaign target goes to the table the pulse reads that campaign from.
  const targetTables =
    campaign?.tableId && tables.some((t) => t.id === campaign.tableId)
      ? tables.filter((t) => t.id === campaign.tableId)
      : tables;
  const setAt = (ctx.now?.() ?? new Date()).toISOString();
  const written: Array<Record<string, unknown>> = [];
  for (const table of targetTables) {
    const next = buildPulseTargetPatch(table.integration_settings || {}, {
      goal: parsed.goal,
      kind: parsed.kind as never,
      value: parsed.value,
      source: "carmen_market",
      rationale,
      campaignId: campaign?.campaignId ?? null,
      campaignName: campaign?.campaignName ?? null,
      setBy: "carmen",
      setAt,
    });
    const { error } = await supabase
      .from("crm_tables")
      .update({ integration_settings: next })
      .eq("id", table.id);
    if (error) throw error;
    written.push({
      table_id: table.id,
      integration_type: table.integration_type,
    });
  }
  const label = `${pulseTargetKindLabel(parsed.kind)} ${parsed.value}`;
  return {
    success: true,
    source: "carmen_market",
    label: "יעד שוק (כרמן)",
    target: label,
    scope: campaign ? "campaign" : "platform",
    campaign: campaign?.campaignName || campaign?.campaignId || null,
    written,
    set_at: setAt,
    note: "מרענון הדופק הבא חריגה מתמשכת מהיעד תתריע כמו יעד מאושר, וההתראה תציין שזה יעד שוק של כרמן. אדם יכול להחליף אותו ביעד מאושר בדשבורד הדופק.",
  };
}

async function requestApprovedTarget(
  supabase: Db,
  ctx: PulseTargetToolContext,
  args: Record<string, unknown>,
) {
  if (!ctx.actorUserId)
    return {
      error: "human_requester_required",
      message:
        "יעד מאושר נקבע רק לבקשת אדם. בלי מבקש — אפשר לקבוע יעד שוק (set_market_target).",
    };
  const parsed = parseTargetInput(args);
  if ("error" in parsed) return parsed;
  const role = roleProblem(ctx);
  if (role) return role;
  await ctx.assertClientAccess(parsed.clientId);
  const tables = await loadPlatformTables(
    supabase,
    ctx,
    parsed.clientId,
    parsed.platform,
  );
  if (!tables.length)
    return {
      error: "no_campaign_table",
      message: "אין ללקוח טבלת קמפיינים מחוברת בפלטפורמה הזו",
    };
  const campaign = matchCampaign(
    await latestCampaignRows(supabase, ctx, [parsed.clientId]),
    parsed,
  );
  // A campaign slot holds one target: a target for the wrong goal would also wipe
  // the one the campaign is measured on.
  const problem = campaignProblem(parsed, campaign);
  if (problem) return problem;
  const tableIds =
    campaign?.tableId && tables.some((t) => t.id === campaign.tableId)
      ? [campaign.tableId]
      : tables.map((t) => t.id);
  const ref = campaign
    ? { campaignId: campaign.campaignId, campaignName: campaign.campaignName }
    : null;
  const previous = tables
    .filter((t) => tableIds.includes(t.id))
    .map((t) => ({
      table_id: t.id,
      target: resolvePulseTarget(
        t.integration_settings || {},
        parsed.goal,
        ref,
      ),
    }));
  const name = await clientName(supabase, parsed.clientId);
  const where = campaign
    ? `קמפיין ${campaign.campaignName || campaign.campaignId}`
    : `כל קמפייני ה${parsed.goal === "leads" ? "לידים" : "איקומרס"}`;
  const title = `יעד ${pulseTargetKindLabel(parsed.kind)} ${parsed.value} ל${name} (${parsed.platform === "meta" ? "Meta" : "Google Ads"}, ${where})`;
  const toolInput = {
    client_id: parsed.clientId,
    platform: parsed.platform,
    goal: parsed.goal,
    kind: parsed.kind,
    value: parsed.value,
    campaign_id: campaign?.campaignId ?? null,
    campaign_name: campaign?.campaignName ?? null,
    table_ids: tableIds,
    note: String(args.note ?? "").trim() || null,
  };

  // One open request per target place: repeat calls reuse it instead of piling up.
  const { data: pending } = await supabase
    .from("agent_approval_queue")
    .select("id, title, tool_input")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "pending")
    .eq("tool_name", "set_pulse_target")
    .eq("requested_by", ctx.actorUserId)
    .order("created_at", { ascending: false })
    .limit(20);
  const reused = (pending || []).find(
    (row: { tool_input?: Record<string, unknown> }) =>
      row.tool_input?.client_id === toolInput.client_id &&
      row.tool_input?.platform === toolInput.platform &&
      row.tool_input?.goal === toolInput.goal &&
      (row.tool_input?.campaign_id ?? null) === toolInput.campaign_id &&
      row.tool_input?.kind === toolInput.kind &&
      Number(row.tool_input?.value) === toolInput.value,
  );
  if (reused)
    return {
      pending_approval: true,
      approval_id: reused.id,
      reused_existing: true,
      action: "set_pulse_target",
      summary: reused.title || title,
      instruction_for_carmen:
        'כבר יש בקשת אישור פתוחה לאותו יעד. הציגי אותה ובקשי "לאשר? (כן/לא)" פעם אחת; אחרי כן — execute_pending_approval עם ה־approval_id הזה.',
    };

  const { data: row, error } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      requested_by: ctx.actorUserId,
      action_type: "set_pulse_target",
      title,
      description: "שינוי יעד דופק מאושר — דורש אישור משתמש מפורש",
      tool_name: "set_pulse_target",
      tool_input: toolInput,
      context: {
        caller_role: ctx.callerRole,
        caller_phone: ctx.callerPhone,
        client_name: name,
        previous,
      },
      status: "pending",
      expires_at: new Date(
        (ctx.now?.() ?? new Date()).getTime() + APPROVAL_TTL_MS,
      ).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return {
    pending_approval: true,
    approval_id: row.id,
    action: "set_pulse_target",
    summary: title,
    previous,
    instruction_for_carmen:
      'הציגי את היעד החדש (ואת הקודם אם יש) ובקשי אישור: "לאשר? (כן/לא)". אל תבצעי עד execute_pending_approval אחרי תשובה חיובית.',
  };
}

export async function executePulseTargetTool(
  supabase: Db,
  ctx: PulseTargetToolContext,
  name: string,
  args: Record<string, unknown>,
) {
  if (name === "get_pulse_targets") return getPulseTargets(supabase, ctx, args);
  if (name === "set_market_target") return setMarketTarget(supabase, ctx, args);
  if (name === "set_pulse_target")
    return requestApprovedTarget(supabase, ctx, args);
  return { error: "כלי לא מוכר" };
}

/**
 * Executes an approved set_pulse_target row (carmen-approval-execute). Writes only
 * to the tables named in the request and only when they still belong to the client.
 */
export async function applyApprovedPulseTarget(
  supabase: Db,
  row: {
    tenant_id: string;
    requested_by?: string | null;
    tool_input?: Record<string, unknown> | null;
  },
  approvedBy: string | null,
  now: () => Date = () => new Date(),
): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const input = row.tool_input || {};
  const parsed = parseTargetInput(input);
  if ("error" in parsed) return { ok: false, result: parsed };
  const tableIds = Array.isArray(input.table_ids)
    ? (input.table_ids as unknown[]).map(String).filter(Boolean)
    : [];
  if (!tableIds.length)
    return { ok: false, result: { error: "table_ids missing" } };
  const { data: tables, error } = await supabase
    .from("crm_tables")
    .select("id, client_id, integration_type, integration_settings")
    .in("id", tableIds)
    .eq("client_id", parsed.clientId)
    .in("integration_type", PLATFORM_TYPES[parsed.platform]);
  if (error) return { ok: false, result: { error: error.message } };
  if (!tables?.length)
    return { ok: false, result: { error: "no matching campaign table" } };
  const setAt = now().toISOString();
  const written: string[] = [];
  for (const table of tables) {
    const next = buildPulseTargetPatch(table.integration_settings || {}, {
      goal: parsed.goal,
      kind: parsed.kind as never,
      value: parsed.value,
      source: "approved",
      campaignId: parsed.campaignId,
      campaignName: (input.campaign_name as string | null) ?? null,
      setBy: row.requested_by ?? null,
      approvedBy,
      setAt,
    });
    const { error: updateError } = await supabase
      .from("crm_tables")
      .update({ integration_settings: next })
      .eq("id", table.id);
    if (updateError)
      return {
        ok: false,
        result: { error: updateError.message, written_before_error: written },
      };
    written.push(table.id);
  }
  return {
    ok: true,
    result: {
      source: "approved",
      target: `${pulseTargetKindLabel(parsed.kind)} ${parsed.value}`,
      client_id: parsed.clientId,
      platform: parsed.platform,
      goal: parsed.goal,
      campaign_id: parsed.campaignId,
      tables: written,
    },
  };
}
