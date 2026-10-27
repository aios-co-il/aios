import type { DbClient } from "../../_shared/supabase-clients.ts";
import { approvalConversationKey, type ConversationInput } from "./binding.ts";
import { resolveApprovalConfirm } from "./resolve.ts";
import type { ApprovalPick } from "./types.ts";

/** Who replied, where, and with which code (approve or reject). */
export interface PickCaller extends ConversationInput {
  userId: string | null;
  role?: string | null;
  code?: string | null;
  mode?: "approve" | "reject";
}

/**
 * The pending row a chat reply or an approval tool refers to, from the tenant's
 * 25 newest pending rows. Throws when the query fails.
 */
export async function loadApprovalPick(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  caller: PickCaller,
): Promise<ApprovalPick> {
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .select(APPROVAL_PICK_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    throw error;
  }

  return resolveApprovalConfirm(data ?? [], {
    userId: caller.userId,
    roles: caller.role ? [caller.role] : [],
    conversationKey: approvalConversationKey(caller),
    code: caller.code,
    mode: caller.mode,
  });
}

const APPROVAL_PICK_COLUMNS =
  "id, action_type, title, description, tool_name, tool_input, context, created_at, status, requested_by, expires_at, run_id";
