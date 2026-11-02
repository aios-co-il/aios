import { buildApprovalPickPromptRule } from "./chat-text.ts";
import { approvalDisplayCode } from "./codes.ts";
import type { ApprovalPick } from "./types.ts";

/**
 * execute_pending_approval result when the call does not resolve to the bound row
 * (or names another row than the bound one: `requestedId`).
 */
export function approvalPickToolResult(
  pick: ApprovalPick | null | undefined,
  {
    nowMs = Date.now(),
    requestedId = null,
  }: { nowMs?: number; requestedId?: string | null } = {},
) {
  const otherRow =
    pick?.kind === "match" && requestedId && requestedId !== pick.row?.id;
  const listed = otherRow ? pick.pickable : pick?.candidates;
  const candidates = (listed || []).slice(0, 10).map((r) => ({
    code: approvalDisplayCode(r, listed),
    approval_id: r.id,
    title: r.title || r.tool_name || null,
    tool_name: r.tool_name || null,
    created_at: r.created_at || null,
  }));
  if (otherRow) {
    return {
      success: false,
      error: "approval_not_bound",
      candidates,
      claim_execution: false,
      instruction_for_carmen:
        'הבקשה שביקשת לבצע אינה הבקשה של המשתמש בשיחה הזו, ולכן לא בוצעה. בקשה אחרת מאושרת רק כשהמשתמש עונה "כן" ואחריו הקוד שלה. אסור לכתוב שבוצעה פעולה.',
      guardrail: "לא בוצע כלום.",
    };
  }

  return {
    success: false,
    error: toolError(pick),
    candidates,
    claim_execution: false,
    instruction_for_carmen: buildApprovalPickPromptRule(pick, { nowMs }).trim(),
    guardrail:
      'לא בוצע כלום. בקשה של משתמש אחר או משיחה אחרת מאושרת רק כשהמשתמש עונה "כן" ואחריו הקוד, או במסך האישורים.',
  };
}

/** The error code Carmen sees for a pick that ran nothing. */
function toolError(pick: ApprovalPick | null | undefined): string {
  if (pick?.kind === "forbidden") {
    return pick.reason || "forbidden";
  }

  if (pick?.kind === "ambiguous") {
    return "ambiguous_approval";
  }

  return pick?.kind === "no_identity" ? "no_identity" : "no_bound_approval";
}
