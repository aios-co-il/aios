import type { RunState } from "./state.ts";
import { summarizeAndStoreAgentMemory } from "../../_shared/agent-memory.ts";
import { estimateLLMCostUSD } from "../llm/cost.ts";
/** persist Run Completion in the original run order. */
export async function persistRunCompletion(
  run: RunState,
): Promise<Response | string | void> {
  const executionTime = Date.now() - run.startTime;
  if (run.serverConversationId && run.callerUserId) {
    await run.dependencies.saveConversationTurn(run.supabase, {
      tenantId: run.resolvedTenantId,
      userId: run.callerUserId,
      conversationId: run.serverConversationId,
      history: run.serverConversationHistory,
      message: String(run.command_text),
      answer: String(run.finalOutput || ""),
    });
  }
  // 6. Log to automation_logs
  if (run.automation_id) {
    await run.supabase.from("automation_logs").insert({
      automation_id: run.automation_id,
      success: true,
      payload: {
        command_text: run.command_text,
        user_name: run.user_name,
        agent_id: run.agent_id as string,
        agent_name: run.agent.name,
      },
      response: {
        agent_output: run.finalOutput,
        model: run.model,
        execution_time_ms: executionTime,
        tools_used: run.toolLog.map((t) => t.tool),
      },
      execution_time_ms: executionTime,
    });
  }
  // 7. Auto-memory for non-Carmen agents (fire and forget, doesn't block response).
  if (
    run.resolvedTenantId &&
    run.finalOutput &&
    run.command_text?.trim().length >= 10
  ) {
    const memPromise = summarizeAndStoreAgentMemory({
      supabase: run.supabase,
      tenant_id: run.resolvedTenantId,
      agent_id: run.agent_id as string,
      user_message: run.command_text,
      assistant_output: run.finalOutput,
      tools_used: run.toolLog.map((t) => t.tool),
    });
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(memPromise);
    } else {
      memPromise.catch(() => {});
    }
  }
  // 8. Run trace — one row per turn so we can audit later whether Carmen
  // actually executed what she claimed. Same shape across every surface.
  try {
    await run.supabase.from("agent_action_log").insert({
      tenant_id: run.resolvedTenantId,
      agent_id: run.agent_id as string,
      action_type: "agent_turn",
      status: "success",
      action_details: {
        surface: run.input.surface,
        command_preview: String(run.command_text || "").slice(0, 240),
        tools_used: run.toolLog.map((t) => t.tool),
        tool_count: run.toolLog.length,
        output_preview: String(run.finalOutput || "").slice(0, 600),
        caller_role: run.callerRole,
        caller_campaigner_id: run.callerCampaignerId,
        active_skills: run.matchedSkills,
        instruction_captured: run.instructionCaptured,
      },
      user_id: run.callerUserId,
      tool_calls: run.toolLog.length,
      model: run.llm.label, // the provider that actually served the request (after any failover)
      duration_ms: executionTime,
      tokens_in: run.usageTokensIn || null,
      tokens_out: run.usageTokensOut || null,
      cost_usd: estimateLLMCostUSD(
        run.llm.label,
        run.usageTokensIn,
        run.usageTokensOut,
      ),
    });
  } catch (e: unknown) {
    console.error(
      "[AGENT] action_log insert failed:",
      (e as Error | null)?.message,
    );
  }
  return new Response(
    JSON.stringify({
      success: true,
      output: run.finalOutput,
      agent_name: run.agent.name,
      model: run.model,
      execution_time_ms: executionTime,
      tools_used: run.toolLog.map((t) => t.tool),
      tool_log: run.toolLog,
      conversation_id: run.serverConversationId,
    }),
    {
      headers: {
        ...run.dependencies.corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}
