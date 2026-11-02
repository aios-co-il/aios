import { PULSE_CATEGORY_LABELS } from "../../campaign-pulse.ts";
import { isJsonObject, type JsonObject } from "../../pulse/json.ts";
import type {
  PulseTargetDb,
  PulseTargetToolContext,
  ToolRefusal,
} from "./context.ts";
import type { TargetInput } from "./parse-target-input.ts";

/** The campaign as the latest pulse sees it (name, table, goal and its target). */
export type PulseCampaignMatch = {
  campaignId: string;
  campaignName: string | null;
  tableId: string | null;
  goal: string | null;
  targetSource: string | null;
  targetValue: number | null;
  targetKind: string | null;
  targetScope: string | null;
  /** The tables the pulse reads the campaign from (null in an older snapshot). */
  readTableIds: string[] | null;
};

/** campaign_breakdown rows of the freshest snapshot of each client. */
export async function latestCampaignRows(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  clientIds: string[],
): Promise<JsonObject[]> {
  if (!clientIds.length) {
    return [];
  }
  const { data, error } = await db
    .from("campaign_pulse_snapshots")
    .select("client_id, calculated_at, campaign_breakdown")
    .in("client_id", clientIds.slice(0, 500))
    .in("tenant_id", ctx.accessibleTenantIds)
    .order("calculated_at", { ascending: false });
  // A failed read must not look like "no pulse": the market range check and the
  // campaign lookup both depend on these rows.
  if (error) {
    throw error;
  }
  const seen = new Set<string>();
  const rows: JsonObject[] = [];
  for (const snapshot of data || []) {
    if (seen.has(snapshot.client_id)) {
      continue;
    }
    seen.add(snapshot.client_id);
    if (Array.isArray(snapshot.campaign_breakdown)) {
      rows.push(...snapshot.campaign_breakdown.filter(isJsonObject));
    }
  }
  return rows;
}

/** The requested campaign's row in the latest pulse of this platform, if any. */
export function matchCampaign(
  rows: JsonObject[],
  input: TargetInput,
): PulseCampaignMatch | null {
  if (!input.campaignId) {
    return null;
  }
  const match = rows.find(
    (row) =>
      String(row.campaign_id ?? "") === input.campaignId &&
      row.platform === input.platform,
  );
  if (!match) {
    return null;
  }
  const targetValue = Number(match.target_value);
  return {
    campaignId: input.campaignId,
    campaignName: textOrNull(match.campaign_name),
    tableId: textOrNull(match.table_id),
    goal: textOrNull(match.goal),
    targetSource: textOrNull(match.target_source),
    targetValue:
      match.target_value != null && Number.isFinite(targetValue)
        ? targetValue
        : null,
    targetKind: textOrNull(match.target_kind),
    targetScope: textOrNull(match.target_scope),
    readTableIds: Array.isArray(match.read_table_ids)
      ? match.read_table_ids.map(String).filter(Boolean)
      : null,
  };
}

/**
 * The tables a campaign target is checked against: the ones the pulse reads the
 * campaign from and resolves its target over. A snapshot from before
 * read_table_ids (or one naming no table still connected) falls back to every
 * table of the client × platform, which can only refuse more.
 */
export function campaignReadTables<T extends { id: string }>(
  tables: T[],
  campaign: PulseCampaignMatch,
): T[] {
  const ids = new Set(campaign.readTableIds ?? []);
  const read = tables.filter((table) => ids.has(table.id));
  return read.length ? read : tables;
}

/**
 * A campaign target needs the campaign in the latest pulse, measured on this
 * goal: a slot holds one target, so a target for the wrong goal would also wipe
 * the one the campaign is measured on.
 */
export function campaignProblem(
  input: TargetInput,
  campaign: PulseCampaignMatch | null,
): ToolRefusal | null {
  if (!input.campaignId) {
    return null;
  }
  if (!campaign) {
    return {
      error: "campaign_not_in_pulse",
      message:
        "הקמפיין לא מופיע בדופק האחרון של הלקוח בפלטפורמה הזו. בדקי את campaign_id ב־get_pulse_targets, או קבעי יעד לפלטפורמה.",
    };
  }
  if (campaign.goal && campaign.goal !== input.goal) {
    return {
      error: "goal_mismatch",
      message: `הדופק מודד את הקמפיין כ${GOAL_LABELS.get(campaign.goal) || "לא מסווג"}, לא כ${GOAL_LABELS.get(input.goal)}. יעד נקבע רק למטרה שלפיה הקמפיין נמדד.`,
    };
  }
  return null;
}

/** Each pulse goal's Hebrew name ("לידים", "איקומרס"), from the pulse's category labels. */
export const GOAL_LABELS = new Map(PULSE_CATEGORY_LABELS);

/** A non-empty value as text, else null. */
function textOrNull(value: unknown): string | null {
  return value ? String(value) : null;
}
