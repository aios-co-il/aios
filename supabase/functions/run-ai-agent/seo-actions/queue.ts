import type { Json } from "../../_shared/database.types.ts";
import type { SeoActionContext, SeoActionPlan } from "./context.ts";
import type { SeoClient, SeoDb } from "../seo-read/context.ts";
import { nowOf, throwIfError } from "../seo-read/context.ts";

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Queues an SEO action for approval in agent_approval_queue as an
 * `agent_direct_tool` row: carmen-approval-execute hands an approved row of that
 * type to run-ai-agent, which runs the same tool with the requester's scope and
 * approval.outOfBand. An open row of the same requester, tool and input is
 * reused instead of piling up (select before insert: the queue has no unique
 * key on tool_input; a rare duplicate still expires on its own).
 */
export async function queueSeoAction(
  db: SeoDb,
  ctx: SeoActionContext,
  tool: string,
  client: SeoClient,
  plan: SeoActionPlan,
) {
  const requester = ctx.actorUserId ?? "";
  const open = await openRequest(db, ctx, requester, tool, plan.input);
  const approvalId =
    open ?? (await insertRequest(db, ctx, requester, tool, client, plan));
  return {
    pending_approval: true,
    approval_id: approvalId,
    reused_open_request: open !== null,
    action: tool,
    summary: plan.summary,
    cost: plan.cost,
    instruction_for_carmen:
      'הציגי למשתמש את הסיכום ואת העלות ובקשי אישור: "לאשר? (כן/לא)". אל תבצעי כלום ואל תכתבי שבוצע עד ש-execute_pending_approval מחזיר success=true.',
  };
}

/** The id of the requester's open row for the same tool and input, if any. */
async function openRequest(
  db: SeoDb,
  ctx: SeoActionContext,
  requester: string,
  tool: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await db
    .from("agent_approval_queue")
    .select("id, tool_input")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "pending")
    .eq("tool_name", tool)
    .eq("requested_by", requester)
    .gt("expires_at", nowOf(ctx).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  // A failed lookup must not read as "none open" and queue a duplicate.
  throwIfError("בקשות אישור פתוחות", error);
  const wanted = canonical(input);
  return (
    (data ?? []).find((row) => canonical(row.tool_input) === wanted)?.id ?? null
  );
}

/** Inserts the pending row and returns its id. */
async function insertRequest(
  db: SeoDb,
  ctx: SeoActionContext,
  requester: string,
  tool: string,
  client: SeoClient,
  plan: SeoActionPlan,
): Promise<string> {
  const { data, error } = await db
    .from("agent_approval_queue")
    .insert({
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      requested_by: requester,
      action_type: "agent_direct_tool",
      title: plan.title,
      description: plan.summary,
      tool_name: tool,
      tool_input: plan.input as Json,
      context: {
        source: "carmen_seo_action",
        client_id: client.id,
        client_name: client.name,
        cost: plan.cost,
      } as Json,
      status: "pending",
      expires_at: new Date(
        nowOf(ctx).getTime() + APPROVAL_TTL_MS,
      ).toISOString(),
    })
    .select("id")
    .single();
  throwIfError("תור האישורים", error);
  if (!data?.id) {
    throw new Error("קריאת תור האישורים נכשלה: לא הוחזר מזהה בקשה");
  }
  return data.id;
}

/** JSON with sorted keys: jsonb does not keep the key order it was given. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
