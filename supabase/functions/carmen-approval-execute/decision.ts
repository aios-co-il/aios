import type { DbClient } from "../_shared/supabase-clients.ts";
import type { Json, Tables } from "../_shared/database.types.ts";
import {
  claimApprovalRow,
  expireApprovalRow,
  type ApprovalRef,
} from "../_shared/carmen/approvals/approver.ts";
import {
  hasCarmenExecutor,
  isApprovalExpired,
} from "../_shared/carmen/approvals/executor-tools.ts";

/** An HTTP status and JSON body for the caller. */
export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** Reject an undecided row for `approvedBy`; a row decided meanwhile gets 409 not_pending. */
export async function rejectApproval(
  supabase: Pick<DbClient, "from">,
  row: ApprovalRef & { status: string },
  approvedBy: string | null,
  reason: Json | undefined,
): Promise<Reply> {
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .update({
      status: "rejected",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      execution_result: { reason: reason || null },
    })
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id)
    .in("status", ["pending", "approved"])
    .select("id");
  if (error) {
    throw error;
  }

  if (!data?.length) {
    return { status: 409, body: { error: "not_pending", status: row.status } };
  }

  return {
    status: 200,
    body: { success: true, rejected: true, approval_id: row.id },
  };
}

/**
 * Claim `row` so only this call runs it ('executing'), once the executor has a
 * route for its tool and it has not expired. Otherwise, or when another caller won
 * the race, the reply to send: 400 unknown_tool, 410 expired, already_executed,
 * or 409 in_progress / not_pending.
 */
export async function claimForRun(
  supabase: Pick<DbClient, "from">,
  row: ApprovalRef & {
    action_type: string;
    tool_name: string | null;
    expires_at: string | null;
  },
  approvedBy: string | null,
): Promise<{ claimed: Tables<"agent_approval_queue"> } | { reply: Reply }> {
  // Not isCarmenExecutableApproval: run steps (run_id) also reach this function,
  // from resume-agent-run through agent_tools handlers (`_approval_id`).
  if (!hasCarmenExecutor(row)) {
    return {
      reply: {
        status: 400,
        body: { error: "unknown_tool", tool_name: row.tool_name },
      },
    };
  }

  if (isApprovalExpired(row)) {
    await expireApprovalRow(supabase, row);
    return {
      reply: { status: 410, body: { error: "expired", approval_id: row.id } },
    };
  }

  return await claimOrConflict(supabase, row, approvedBy);
}

/** Close a row this call claimed as failed. A failed update is logged, not thrown. */
export async function markApprovalFailed(
  supabase: Pick<DbClient, "from">,
  row: ApprovalRef,
  result: Json,
): Promise<void> {
  const { error } = await supabase
    .from("agent_approval_queue")
    .update({
      status: "failed",
      executed_at: new Date().toISOString(),
      execution_result: result,
    })
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id)
    .eq("status", "executing");
  if (error) {
    console.error("[carmen-approval-execute] mark failed", error);
  }
}

/** The claim itself; a caller that lost the race gets the reply for the row's state. */
async function claimOrConflict(
  supabase: Pick<DbClient, "from">,
  row: ApprovalRef,
  approvedBy: string | null,
): Promise<{ claimed: Tables<"agent_approval_queue"> } | { reply: Reply }> {
  const claimed = await claimApprovalRow(supabase, row, approvedBy);
  if (claimed) {
    return { claimed };
  }

  const { data: current, error } = await supabase
    .from("agent_approval_queue")
    .select("status, execution_result")
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id)
    .maybeSingle();
  if (error) {
    throw error;
  }

  if (current?.status === "executed") {
    return {
      reply: {
        status: 200,
        body: {
          success: true,
          already_executed: true,
          result: current.execution_result,
        },
      },
    };
  }

  return {
    reply: {
      status: 409,
      body: {
        error: current?.status === "executing" ? "in_progress" : "not_pending",
        status: current?.status ?? null,
        approval_id: row.id,
      },
    },
  };
}
