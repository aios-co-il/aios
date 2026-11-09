import type { ToolResultMetadata } from "../tool-result-metadata.ts";
import type { Json } from "../../_shared/database.types.ts";
import { resolveDirectCaller } from "./caller.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";

import type { DirectToolRequest } from "./types.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { ToolExecutor } from "../tool-execution/route.ts";
import { json } from "./response.ts";

/** Executes the same service-approved row and records its terminal status afterwards. */
export async function executeApprovedDirectTool(
  req: DirectToolRequest,
  supabase: AgentDatabaseClient,
  executeTool: ToolExecutor,
): Promise<Response> {
  const { data: row } = await supabase
    .from("agent_approval_queue")
    .select("*")
    .eq("id", req.approval_id as string)
    .maybeSingle();
  if (!row || row.action_type !== "agent_direct_tool") {
    return json({ error: "approval_not_found" }, 404);
  }
  if (row.status === "executed" || row.status === "rejected") {
    return json({ error: `approval_${row.status}` }, 409);
  }
  const scope = await resolveDirectCaller(
    supabase,
    row.tenant_id,
    row.requested_by,
  );
  let result: unknown;
  let failed = false;
  try {
    result = await executeTool(
      row.tool_name as string,
      (row.tool_input || {}) as Record<string, unknown>,
      supabase,
      row.tenant_id,
      scope.userId,
      scope.campaignerId,
      row.agent_id,
      scope.role,
      scope.managedAgencyIds,
      null,
      null,
      "agent_direct",
      null,
      { outOfBand: true },
    );
    const metadata = result as ToolResultMetadata | null | undefined;
    failed = !!metadata?.error || !!metadata?.pending_approval;
  } catch (e) {
    failed = true;
    result = { error: String((e as Error | null)?.message ?? e) };
  }
  await supabase
    .from("agent_approval_queue")
    .update({
      status: failed ? "failed" : "executed",
      approved_by: asUuidOrNull(req.approved_by) || row.requested_by,
      approved_at: row.approved_at || new Date().toISOString(),
      executed_at: new Date().toISOString(),
      execution_result: result as Json,
    })
    .eq("id", row.id);
  return json({ success: !failed, result }, failed ? 400 : 200);
}
