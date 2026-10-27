// Who may decide an agent_approval_queue row, and the one-time claim before it runs.
import type { DbClient } from "../../supabase-clients.ts";
import type { Tables } from "../../database.types.ts";
import { approverDecision } from "./gate.ts";

/** execute runs the row; reject only records the decision. */
export type ApprovalMode = "execute" | "reject";

/** The row a service-role update targets: its id, scoped to its own tenant. */
export interface ApprovalRef {
  id: string;
  tenant_id: string;
}

/** Tenant + role gate for the user deciding `row`. */
export async function authorizeApprovalActor(
  supabase: Pick<DbClient, "from">,
  row: {
    tenant_id: string;
    tool_name?: string | null;
    requested_by?: string | null;
  },
  userId: string | null,
  mode: ApprovalMode,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!userId) {
    return approverDecision({ row, userId: null, mode });
  }

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
  supabase: Pick<DbClient, "from">,
  row: ApprovalRef,
  approverId: string | null,
  {
    from = ["pending", "approved"],
    to = "executing",
  }: { from?: string[]; to?: string } = {},
): Promise<Tables<"agent_approval_queue"> | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .update({
      status: to,
      approved_by: approverId,
      approved_at: nowIso,
    })
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id)
    .in("status", from)
    .or(`expires_at.is.null,expires_at.gt."${nowIso}"`)
    .select("*");
  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

/** Mark a live row expired (no-op if it was decided meanwhile). */
export async function expireApprovalRow(
  supabase: Pick<DbClient, "from">,
  row: ApprovalRef,
): Promise<void> {
  const { error } = await supabase
    .from("agent_approval_queue")
    .update({
      status: "expired",
      execution_result: { error: "expired" },
    })
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id)
    .in("status", ["pending", "approved"]);
  if (error) {
    throw error;
  }
}

/** Roles of the user in the row's tenant (plus global roles) and tenant membership. */
async function loadApproverScope(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  userId: string,
): Promise<{ roles: string[]; member: boolean }> {
  const [
    { data: roleRows, error: rolesError },
    { data: memberRows, error: memberError },
  ] = await Promise.all([
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
  if (rolesError) {
    throw rolesError;
  }

  if (memberError) {
    throw memberError;
  }

  return {
    roles: (roleRows ?? []).map((r) => r.role),
    member:
      (memberRows ?? []).length > 0 ||
      (roleRows ?? []).some((r) => r.tenant_id === tenantId),
  };
}
