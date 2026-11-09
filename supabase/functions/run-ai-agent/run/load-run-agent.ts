import type { RunAgent } from "./contracts.ts";
import type { RunState } from "./state.ts";
import { loadCarmenAgent } from "../../_shared/carmen/load-carmen-agent.ts";
import { isCarmenAgentRow } from "../../_shared/carmen/carmen-agent.ts";
import { shouldUseTokenOptimize } from "../../_shared/carmen-token-optimizer.ts";
import { buildQuickAck } from "../../_shared/carmen-token-optimizer.ts";
/** load Run Agent in the original run order. */
export async function loadRunAgent(
  run: RunState,
): Promise<Response | string | void> {
  if (run.agent_id) {
    const { data, error: agentError } = await run.supabase
      .from("ai_agents")
      .select("*")
      .eq("id", run.agent_id)
      .single()
      .returns<RunAgent>();
    if (agentError || !data) {
      throw new Error(`Agent not found: ${run.agent_id}`);
    }
    run.agent = data;
  } else {
    // No agent_id provided — look up the active Carmen agent for the tenant.
    // This lets AIOS / other surfaces invoke the unified brain without preloading the id.
    if (!run.tenant_id) {
      throw new Error(
        "Missing agent_id or tenant_id (one is required to resolve the agent)",
      );
    }
    const carmen = await loadCarmenAgent(run.supabase, run.tenant_id, {
      activeOnly: true,
    });
    if (!carmen) {
      throw new Error(
        `No active Carmen agent found for tenant ${run.tenant_id}`,
      );
    }
    run.agent = carmen;
    run.agent_id = carmen.id;
    console.log(
      `[AGENT] Resolved default Carmen agent: ${run.agent.name} (${run.agent_id})`,
    );
  }
  run.isCarmenAgent = isCarmenAgentRow(run.agent);
  run.tokenOptimize = shouldUseTokenOptimize(run.agent, run.isCarmenAgent);
  if (run.input.emit && run.tokenOptimize && !run.pinSkillsOnly) {
    run.input.emit({
      type: "status",
      content: buildQuickAck(String(run.command_text || "")),
    });
  }
  console.log(
    `[AGENT] token_optimize=${run.tokenOptimize} for ${run.agent.name}`,
  );
  run.resolvedTenantId = run.tenant_id || run.agent.tenant_id;
  run.resolvedUserId = run.user_id || "system";
}
