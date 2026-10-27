import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { requireAuth } from "../_shared/security.ts";
import {
  approveDevTask,
  attachDevTaskSession,
  createDevTask,
  dispatchDevTask,
  findDuplicateDevTasks,
  logDevTaskEvent,
  type DevTaskBrief,
} from "../_shared/dev-tasks.ts";
import {
  devTaskCenterRefusal,
  devTaskUpdatePatch,
  type DevEscalationTier,
} from "../_shared/dev-task-approval.ts";
import { getDevEscalationTier } from "../_shared/dev-escalation-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const auth = await requireAuth(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const tenantId = String(body.tenant_id || "").trim();
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userId = auth.kind === "user" ? auth.userId : null;

    // The body names the tenant: a signed-in user must belong to it, and only a dev-escalation
    // tier (David; Ana for Cursor bug fixes) may change, approve or send its dev tasks.
    const service = auth.kind === "service";
    const member =
      service || (await isTenantMember(supabase, tenantId, userId));
    const tier: DevEscalationTier = service
      ? null
      : await centerTier(supabase, tenantId, userId);
    const taskId = String(body.id || "");
    let agent: string | null = null;
    if (action === "create") agent = String(body.assigned_agent || "cursor");
    else if (["update", "approve", "dispatch"].includes(action) && taskId) {
      const { data: row } = await supabase
        .from("dev_tasks")
        .select("assigned_agent")
        .eq("id", taskId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      agent =
        action === "update" && body.assigned_agent !== undefined
          ? String(body.assigned_agent)
          : (row?.assigned_agent ?? null);
    }
    const refusal = devTaskCenterRefusal({
      action,
      service,
      member,
      tier,
      agent,
    });
    if (refusal)
      return new Response(JSON.stringify({ error: refusal.error }), {
        status: refusal.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (action === "list") {
      let q = supabase
        .from("dev_tasks")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });
      if (body.status) q = q.eq("status", body.status);
      if (body.priority) q = q.eq("priority", body.priority);
      const limit = Math.min(Number(body.limit) || 50, 100);
      const { data, error } = await q.limit(limit);
      if (error) throw error;
      return json({ tasks: data || [] });
    }

    if (action === "get") {
      const id = String(body.id || "");
      const { data, error } = await supabase
        .from("dev_tasks")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      const { data: events } = await supabase
        .from("dev_task_events")
        .select("*")
        .eq("dev_task_id", id)
        .order("created_at", { ascending: false })
        .limit(30);
      return json({ task: data, events: events || [] });
    }

    if (action === "find_duplicates") {
      const title = String(body.title || "").trim();
      if (!title) return json({ duplicates: [] });
      const duplicates = await findDuplicateDevTasks(supabase, tenantId, title);
      return json({ duplicates });
    }

    if (action === "create") {
      const brief = body.brief as DevTaskBrief;
      if (!brief?.title?.trim()) throw new Error("brief.title required");
      const duplicates = await findDuplicateDevTasks(
        supabase,
        tenantId,
        brief.title,
      );
      const task = await createDevTask(supabase, {
        tenantId,
        brief,
        priority: body.priority,
        assignedAgent: body.assigned_agent,
        requestedByUserId: userId,
        sourceConversationId: body.source_conversation_id,
        sourceMessage: body.source_message,
        dedupOf: body.dedup_of,
        actorUserId: userId,
      });
      return json({ task, possible_duplicates: duplicates.slice(0, 5) });
    }

    if (action === "update") {
      const id = String(body.id || "");
      // Approval is set only by "approve"; an edit to what will be sent asks for a new one.
      const { data: current } = await supabase
        .from("dev_tasks")
        .select("status")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const update = devTaskUpdatePatch(current, body, [
        "title",
        "problem",
        "expected_behavior",
        "current_behavior",
        "scope",
        "affected_areas",
        "constraints",
        "acceptance_criteria",
        "base_branch",
        "environment",
        "priority",
        "status",
        "assigned_agent",
        "pr_url",
        "owner_user_id",
      ]);
      if (!update.ok)
        return new Response(JSON.stringify({ error: update.message }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      const patch = update.patch;
      const { data, error } = await supabase
        .from("dev_tasks")
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      await logDevTaskEvent(supabase, {
        devTaskId: id,
        tenantId,
        eventType: "updated",
        actorUserId: userId,
        detail: patch,
      });
      return json({ task: data });
    }

    if (action === "approve") {
      const task = await approveDevTask(
        supabase,
        tenantId,
        String(body.id),
        userId!,
      );
      return json({ task });
    }

    if (action === "dispatch") {
      // A signed-in user pressing "send" on a draft in the Command Center approves it.
      const { data: current } = await supabase
        .from("dev_tasks")
        .select("status")
        .eq("id", String(body.id))
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (current?.status === "draft" && userId)
        await approveDevTask(supabase, tenantId, String(body.id), userId);
      const result = await dispatchDevTask(supabase, {
        tenantId,
        taskId: String(body.id),
        actorUserId: userId,
      });
      return json(result);
    }

    if (action === "attach_session") {
      const task = await attachDevTaskSession(supabase, {
        tenantId,
        taskId: String(body.id),
        cursorSessionId: String(body.cursor_session_id),
        cursorSessionUrl: body.cursor_session_url,
        actorUserId: userId,
      });
      return json({ task });
    }

    if (action === "cancel") {
      const id = String(body.id || "");
      const { data, error } = await supabase
        .from("dev_tasks")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      await logDevTaskEvent(supabase, {
        devTaskId: id,
        tenantId,
        eventType: "cancelled",
        actorUserId: userId,
      });
      return json({ task: data });
    }

    if (action === "mark_done") {
      const id = String(body.id || "");
      const { data, error } = await supabase
        .from("dev_tasks")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      await logDevTaskEvent(supabase, {
        devTaskId: id,
        tenantId,
        eventType: "done",
        actorUserId: userId,
      });
      return json({ task: data });
    }

    return new Response(
      JSON.stringify({ error: `unknown action: ${action}` }),
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (e: unknown) {
    console.error("[dev-task-center]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
});

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** The signed-in user belongs to the tenant (tenant_users) or is a super admin. */
async function isTenantMember(
  supabase: any,
  tenantId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const { data: row } = await supabase
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (row) return true;
  const { data: admin } = await supabase.rpc("is_super_admin", {
    _user_id: userId,
  });
  return admin === true;
}

/** The user's dev-escalation tier: the Command Center access row, else the fixed allowlist. */
async function centerTier(
  supabase: any,
  tenantId: string,
  userId: string | null,
): Promise<DevEscalationTier> {
  if (!userId) return null;
  const { data: rows } = await supabase
    .from("carmen_command_center_access")
    .select("dev_escalation_tier")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(10);
  const tiers = (rows || []).map(
    (r: { dev_escalation_tier?: string | null }) => r.dev_escalation_tier,
  );
  if (tiers.includes("full")) return "full";
  if (tiers.includes("bugfix")) return "bugfix";
  return getDevEscalationTier({ userId }) as DevEscalationTier;
}
