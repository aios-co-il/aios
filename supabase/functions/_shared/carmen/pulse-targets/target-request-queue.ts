import type { Json } from "../../database.types.ts";
import { isJsonObject } from "../../pulse/json.ts";
import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";

/** The tool_input of a queued set_pulse_target row. */
export type TargetRequestInput = {
  client_id: string;
  platform: string;
  goal: string;
  kind: string;
  value: number;
  campaign_id: string | null;
  campaign_name: string | null;
  table_ids: string[];
  note: string | null;
};

/**
 * The requester's open request for the same target place, kind and value, so a
 * repeat call reuses it instead of piling up. An expired row is skipped:
 * carmen-approval-execute answers 410 for it. This is a select before the insert:
 * agent_approval_queue has no unique key on tool_input to upsert on, and a rare
 * duplicate row is still approved or expires on its own. A unique index or a
 * reservation replaces it in AIO-275.
 */
export async function findPendingTargetRequest(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  requester: string,
  toolInput: TargetRequestInput,
): Promise<{ id: string; title: string } | null> {
  const { data, error } = await db
    .from("agent_approval_queue")
    .select("id, title, tool_input")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "pending")
    .eq("tool_name", "set_pulse_target")
    .eq("requested_by", requester)
    .gt("expires_at", (ctx.now?.() ?? new Date()).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  // A failed lookup must not read as "none open" and queue a duplicate.
  if (error) {
    throw error;
  }
  return (
    (data || []).find((row) => sameTarget(row.tool_input, toolInput)) ?? null
  );
}

/** Queues the request for 24 hours and returns its approval id. */
export async function queueTargetRequest(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  requester: string,
  request: { title: string; toolInput: TargetRequestInput; context: Json },
): Promise<string> {
  const { data, error } = await db
    .from("agent_approval_queue")
    .insert({
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      requested_by: requester,
      action_type: "set_pulse_target",
      title: request.title,
      description: "שינוי יעד דופק מאושר — דורש אישור משתמש מפורש",
      tool_name: "set_pulse_target",
      tool_input: request.toolInput,
      context: request.context,
      status: "pending",
      expires_at: new Date(
        (ctx.now?.() ?? new Date()).getTime() + APPROVAL_TTL_MS,
      ).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id;
}

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/** Is a stored tool_input the same client, platform, goal, campaign, kind and value? */
function sameTarget(stored: Json | null, wanted: TargetRequestInput): boolean {
  return (
    isJsonObject(stored) &&
    stored.client_id === wanted.client_id &&
    stored.platform === wanted.platform &&
    stored.goal === wanted.goal &&
    (stored.campaign_id ?? null) === wanted.campaign_id &&
    stored.kind === wanted.kind &&
    Number(stored.value) === wanted.value
  );
}
