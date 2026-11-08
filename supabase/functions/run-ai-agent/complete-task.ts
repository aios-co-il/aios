import type { AgentDatabaseClient } from "./database-contracts.ts";
/** Complete exactly one accessible task; a missing row is a failed completion. */
export async function completeAccessibleTask(
  db: AgentDatabaseClient,
  taskId: string,
  tenantIds: Array<string>,
): Promise<void> {
  const { data, error } = await db
    .from("tasks")
    .update({ status: "done", assigned_agent: null })
    .eq("id", taskId)
    .in("tenant_id", tenantIds)
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Task completion did not update a task");
  }
}
