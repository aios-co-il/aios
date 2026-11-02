import {
  APPROVER_ONLY_RISK_CLASSES,
  approvalRiskClass,
  type RiskClass,
} from "./risk-classes.ts";

/** The row fields the approval gate reads. */
export interface GateRow {
  tool_name?: string | null;
  requested_by?: string | null;
}

/** The user deciding a row and their roles (one role or a list). */
export interface Decider {
  userId?: string | null;
  roles?: string | readonly string[] | null;
}

/** Whether the decider may act on the row, and why not. */
export type GateResult =
  { ok: true; reason: null } | { ok: false; reason: string };

/**
 * Server-side decision for carmen-approval-execute / resume-agent-run.
 * `member` = the approver belongs to the row's tenant (tenant_users or a tenant role).
 */
export function approverDecision({
  row,
  userId,
  roles,
  member,
  mode,
}: {
  row?: GateRow | null;
  userId?: string | null;
  roles?: readonly string[];
  member?: boolean;
  mode?: "execute" | "reject";
} = {}): { ok: true } | { ok: false; status: number; error: string } {
  if (!userId) {
    return { ok: false, status: 403, error: "approver_required" };
  }

  const list = Array.isArray(roles) ? roles : [];
  // Do not reveal another tenant's rows.
  if (!member && !list.includes("super_admin")) {
    return { ok: false, status: 404, error: "approval_not_found" };
  }

  const gate =
    mode === "reject"
      ? canRejectRow(row, { userId, roles: list })
      : canApproveRow(row, { userId, roles: list });
  if (!gate.ok) {
    return { ok: false, status: 403, error: gate.reason };
  }

  return { ok: true };
}

/**
 * May this user run this row? Approver-only classes need an approver role;
 * the rest need the requester or an approver.
 */
export function canApproveRow(
  row: GateRow | null | undefined,
  { userId, roles }: Decider = {},
): GateResult & { risk_class: RiskClass } {
  const risk_class = approvalRiskClass(row);
  if (!userId) {
    return { ok: false, reason: "no_identity", risk_class };
  }

  const approver = isApproverRole(roles);
  if (APPROVER_ONLY_RISK_CLASSES.includes(risk_class)) {
    return approver
      ? { ok: true, reason: null, risk_class }
      : { ok: false, reason: "approver_role_required", risk_class };
  }

  if (approver || (row?.requested_by && row.requested_by === userId)) {
    return { ok: true, reason: null, risk_class };
  }

  return { ok: false, reason: "not_requester", risk_class };
}

/** Rejecting is open to the requester (withdraw) and to approvers. */
export function canRejectRow(
  row: GateRow | null | undefined,
  { userId, roles }: Decider = {},
): GateResult {
  if (!userId) {
    return { ok: false, reason: "no_identity" };
  }

  if (
    isApproverRole(roles) ||
    (row?.requested_by && row.requested_by === userId)
  ) {
    return { ok: true, reason: null };
  }

  return { ok: false, reason: "not_requester" };
}

/** Owner, agency owner and super admin may approve money, external_send, config and destructive rows. */
function isApproverRole(roles: Decider["roles"]): boolean {
  const list = typeof roles === "string" ? [roles] : (roles ?? []);
  return list.some((r) => APPROVER_ROLES.includes(r));
}

const APPROVER_ROLES: readonly string[] = Object.freeze([
  "owner",
  "agency_owner",
  "super_admin",
]);
