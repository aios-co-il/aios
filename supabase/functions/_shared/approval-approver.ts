// Who may decide an agent_approval_queue row, and the one-time claim before it runs.
// Used by carmen-approval-execute and resume-agent-run (AIO-230). The decision itself
// is pure and tested in wa-approval-flow.mjs (approverDecision / canApproveRow).
import { approverDecision } from "./wa-approval-flow.ts";

export type ApprovalMode = "execute" | "reject";

/** Roles of the user in the row's tenant (plus global roles) and tenant membership. */
export async function loadApproverScope(
  supabase: any,
  tenantId: string,
  userId: string,
): Promise<{ roles: string[]; member: boolean }> {
  const [{ data: roleRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", userId)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    supabase
      .from("tenant_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .limit(1),
  ]);
  const rows = (roleRows || []) as Array<{ role: string; tenant_id: string }>;
  return {
    roles: rows.map((r) => String(r.role)),
    member:
      ((memberRows || []) as unknown[]).length > 0 ||
      rows.some((r) => r.tenant_id === tenantId),
  };
}

/** Tenant + role gate for the user deciding `row`. */
export async function authorizeApprovalActor(
  supabase: any,
  row: {
    tenant_id: string;
    tool_name?: string | null;
    requested_by?: string | null;
  },
  userId: string | null,
  mode: ApprovalMode,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!userId) return approverDecision({ row, userId: null, mode });
  const scope = await loadApproverScope(supabase, row.tenant_id, userId);
  return approverDecision({
    row,
    userId,
    roles: scope.roles,
    member: scope.member,
    mode,
  });
}

/**
 * Atomically move a live row out of `from` (default pending/approved) to `to`
 * (default 'executing') so it runs once. Returns the claimed row, or null when
 * another caller got it first, it was decided already, or it expired.
 */
export async function claimApprovalRow(
  supabase: any,
  approvalId: string,
  approverId: string | null,
  {
    from = ["pending", "approved"],
    to = "executing",
  }: { from?: string[]; to?: string } = {},
): Promise<any | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .update({
      status: to,
      approved_by: approverId,
      approved_at: nowIso,
    })
    .eq("id", approvalId)
    .in("status", from)
    .or(`expires_at.is.null,expires_at.gt."${nowIso}"`)
    .select("*");
  if (error) throw error;
  return (data && data[0]) || null;
}

/** Mark a live row expired (no-op if it was decided meanwhile). */
export async function expireApprovalRow(supabase: any, approvalId: string) {
  await supabase
    .from("agent_approval_queue")
    .update({
      status: "expired",
      execution_result: { error: "expired" },
    })
    .eq("id", approvalId)
    .in("status", ["pending", "approved"]);
}
