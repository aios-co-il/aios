/** The dev task Carmen offered in this conversation: find it, or cancel it on the user's no. */
import { DEV_TASK_OFFER_TTL_MS } from "./dev-task-approval.ts";
import { logDevTaskEvent } from "./dev-tasks.ts";

type Db = { from: (table: string) => any };

/**
 * The task Carmen offered in this conversation: the newest one still open to a yes (draft, or
 * approved and not yet sent), opened before this turn and not long ago.
 */
export async function findOfferedDevTask(
  supabase: Db,
  args: { tenantId: string; conversationId: string; turnStartedAt: string },
): Promise<{
  id: string;
  title?: string | null;
  assigned_agent?: string | null;
  status?: string | null;
} | null> {
  const started = Date.parse(args.turnStartedAt);
  if (!Number.isFinite(started)) return null;
  const { data } = await supabase
    .from("dev_tasks")
    .select("id, title, assigned_agent, status")
    .eq("tenant_id", args.tenantId)
    .eq("source_conversation_id", args.conversationId)
    .in("status", ["draft", "approved"])
    .lt("created_at", args.turnStartedAt)
    .gte("created_at", new Date(started - DEV_TASK_OFFER_TTL_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? data : null;
}

/** The user said no to the offered task: cancel it, so no later yes can send it. */
export async function declineOfferedDevTask(
  supabase: Db,
  args: { tenantId: string; taskId: string; actorUserId?: string | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("dev_tasks")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", args.taskId)
    .eq("tenant_id", args.tenantId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data?.id) return false;
  await logDevTaskEvent(supabase, {
    devTaskId: args.taskId,
    tenantId: args.tenantId,
    eventType: "declined",
    actorUserId: args.actorUserId ?? null,
    detail: { via: "workshop_chat" },
  });
  return true;
}
