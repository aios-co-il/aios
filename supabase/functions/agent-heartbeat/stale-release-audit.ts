/**
 * The task_updates audit row heartbeat writes when it releases a stale agent
 * task. task_updates.user_id is a profiles uuid and the table has no
 * tenant_id, so the row is written as the tenant owner; with no owner, no row.
 */

import type { DbClient } from "../_shared/supabase-clients.ts";
import { tenantOwnerUserId } from "../_shared/tenants/owner.ts";

/** The user stale-release audit rows are written as, or null (logged once per tenant) when there is none. */
export async function staleReleaseAuditUser(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
): Promise<string | null> {
  let reason = "no owner";
  try {
    const owner = await tenantOwnerUserId(supabase, tenantId);
    if (owner) {
      return owner;
    }
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e);
  }
  console.warn(
    "[agent-heartbeat] stale-release audit skipped",
    tenantId,
    reason,
  );
  return null;
}

/** Writes the audit row for one released task; a failed insert is logged, not thrown. */
export async function writeStaleReleaseAudit(
  supabase: Pick<DbClient, "from">,
  auditUserId: string,
  task: { id: string; assigned_agent: string | null },
): Promise<void> {
  const { error } = await supabase.from("task_updates").insert({
    task_id: task.id,
    user_id: auditUserId,
    content: `Heartbeat: המשימה שוחררה מהסוכן ${task.assigned_agent} בגלל חוסר פעילות 24+ שעות`,
    update_type: "agent_action",
  });
  if (error) {
    console.warn(
      "[agent-heartbeat] stale-release audit insert failed",
      task.id,
      error.message,
    );
  }
}
