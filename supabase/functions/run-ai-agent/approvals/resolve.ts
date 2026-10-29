// A chat "כן" runs only a pending row the same user requested in the same
// conversation within the last 30 minutes; anything else is listed with a code
// ("כן 4821" picks one). carmen-approval-execute applies the same role gate to
// every caller, so these chat rules are the first line, not the only one.
import { normalizeApprovalText } from "../../_shared/wa-approval-flow.ts";
import {
  canApproveRow,
  canRejectRow,
  type GateResult,
} from "../../_shared/carmen/approvals/gate.ts";
import {
  isApprovalExpired,
  isCarmenExecutableApproval,
} from "../../_shared/carmen/approvals/executor-tools.ts";
import { boundConversationKey } from "./binding.ts";
import { approvalCodeMatches } from "./codes.ts";
import type { ApprovalPick, PickRow } from "./types.ts";

/** How long a bare "כן" in the same conversation still runs the caller's own request. */
export const APPROVAL_CONFIRM_WINDOW_MS = 30 * 60 * 1000;

/**
 * Decide which pending row a confirmation (or, with mode 'reject', a "לא") refers to.
 * rows: newest-first agent_approval_queue rows of the tenant.
 * Reject mode uses the reject gate, so a requester can withdraw their own approver-only row.
 */
export function resolveApprovalConfirm(
  rows: readonly PickRow[] | null | undefined,
  {
    userId,
    roles,
    conversationKey,
    code,
    mode = "approve",
    nowMs = Date.now(),
    windowMs = APPROVAL_CONFIRM_WINDOW_MS,
  }: {
    userId?: string | null;
    roles?: string | readonly string[] | null;
    conversationKey?: string | null;
    code?: string | null;
    mode?: "approve" | "reject";
    nowMs?: number;
    windowMs?: number;
  } = {},
): ApprovalPick {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!userId) {
    return { kind: "no_identity", candidates: [], pickable: [], blocked: 0 };
  }

  const live = list.filter(
    (r) =>
      r.status === "pending" &&
      !isApprovalExpired(r, nowMs) &&
      isCarmenExecutableApproval(r),
  );
  const who = { userId, roles };
  const gate = (r: PickRow) =>
    mode === "reject" ? canRejectRow(r, who) : canApproveRow(r, who);
  const pickable = live.filter((r) => gate(r).ok);
  if (code) {
    return pickByCode(pickable, code);
  }

  const bound = conversationKey
    ? live.filter((r) => {
        if (r.requested_by !== userId) {
          return false;
        }

        if (boundConversationKey(r) !== conversationKey) {
          return false;
        }

        const created = Date.parse(r.created_at);
        return Number.isFinite(created) && nowMs - created <= windowMs;
      })
    : [];
  return pickBound(bound, gate, pickable);
}

/** A short reply that Carmen answers without the LLM (execute, refuse, or list). */
export function isDeterministicApprovalPick(
  pick: ApprovalPick | null | undefined,
  text: unknown,
): boolean {
  if (!pick || normalizeApprovalText(text).length > 40) {
    return false;
  }

  return (
    pick.kind === "match" ||
    pick.kind === "forbidden" ||
    pick.kind === "ambiguous"
  );
}

/** "כן <קוד>": the one pickable row with that code, or why there is none. */
function pickByCode(pickable: PickRow[], code: string): ApprovalPick {
  const byCode = pickable.filter((r) => approvalCodeMatches(r, code));
  if (byCode.length === 1) {
    return {
      kind: "match",
      via: "code",
      row: byCode[0],
      candidates: [],
      pickable,
      blocked: 0,
    };
  }

  if (byCode.length > 1) {
    return {
      kind: "ambiguous",
      via: "code",
      candidates: byCode,
      pickable,
      blocked: 0,
    };
  }

  return {
    kind: "code_not_found",
    code,
    candidates: pickable,
    pickable,
    blocked: 0,
  };
}

/** A bare "כן": the caller's one recent row from this conversation, if the gate allows it. */
function pickBound(
  bound: PickRow[],
  gate: (r: PickRow) => GateResult,
  pickable: PickRow[],
): ApprovalPick {
  const allowed = bound.filter((r) => gate(r).ok);
  const blocked = bound.length - allowed.length;
  if (bound.length === 1 && allowed.length === 1) {
    return {
      kind: "match",
      via: "bound",
      row: bound[0],
      candidates: [],
      pickable,
      blocked: 0,
    };
  }

  if (bound.length === 1 || (bound.length > 1 && allowed.length === 0)) {
    const row = bound[0];
    const reason = gate(row).reason;
    return {
      kind: "forbidden",
      via: "bound",
      row,
      reason,
      candidates: [],
      pickable,
      blocked,
    };
  }

  if (bound.length > 1) {
    return {
      kind: "ambiguous",
      via: "bound",
      candidates: allowed,
      pickable,
      blocked,
    };
  }

  return { kind: "none", candidates: pickable, pickable, blocked: 0 };
}
