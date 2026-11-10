import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { Emit } from "../run/emit.ts";
import type { FastLaneRequest } from "./request.ts";
import { fastLaneTarget } from "./target.ts";
import { fastLaneBriefScope } from "./scope.ts";
import { loadOrgBrief } from "../../_shared/carmen/org-brief/brief.ts";
import { callerAddressLine } from "../../_shared/carmen/user-address.ts";
import { answerFast } from "./answer.ts";
import { fastLaneInstructions } from "./instructions.ts";
import { saveConversationTurn } from "../run/save-conversation-turn.ts";
import { estimateLLMCostUSD } from "../llm/cost.ts";
import { corsHeaders } from "../runtime.ts";

/**
 * Lets a quick model answer the turn (fast-lane/). Returns the run's response when it answered,
 * or null when it handed the turn over, failed or has no model, so the full brain runs.
 */
export async function tryFastLane(
  supabase: AgentDatabaseClient,
  emit: Emit,
  turn: FastLaneRequest,
): Promise<Response | null> {
  const startedAt = Date.now();
  const [target, brief, addressLine] = await Promise.all([
    fastLaneTarget(supabase, turn.tenantId),
    fastLaneBriefScope(supabase, turn.caller).then((scope) =>
      loadOrgBrief(supabase, turn.tenantId, new Date(), scope),
    ),
    callerAddressLine(supabase, turn.userId, turn.callerName),
  ]);
  if (!target) {
    return null;
  }
  const answer = await answerFast({
    target,
    instructions: fastLaneInstructions({
      agentName: turn.agentName,
      addressLine,
      brief,
      now: new Date(),
    }),
    history: turn.history,
    message: turn.message,
    onText: (content) => emit?.({ type: "token", content }),
  });
  const durationMs = Date.now() - startedAt;
  if (answer.kind === "escalate") {
    console.log(
      `[AGENT] fast lane handed over (${answer.reason}) after ${durationMs}ms`,
    );
    // Words it already showed stay; the full answer starts on its own paragraph.
    if (answer.shown) {
      emit?.({ type: "token", content: "\n\n" });
    }
    return null;
  }
  console.log(
    `[AGENT] fast lane answered in ${durationMs}ms (${target.label})`,
  );
  if (turn.conversationId && turn.userId) {
    await saveConversationTurn(supabase, {
      ...turn,
      userId: turn.userId,
      conversationId: turn.conversationId,
      answer: answer.text,
    });
  }
  const tokensIn = answer.usage?.prompt_tokens ?? 0;
  const tokensOut = answer.usage?.completion_tokens ?? 0;
  const { error } = await supabase.from("agent_action_log").insert({
    tenant_id: turn.tenantId,
    agent_id: turn.agentId,
    action_type: "agent_turn",
    status: "success",
    action_details: {
      surface: turn.surface,
      fast_lane: true,
      command_preview: turn.message.slice(0, 240),
      tools_used: [],
      tool_count: 0,
      output_preview: answer.text.slice(0, 600),
    },
    user_id: turn.userId,
    tool_calls: 0,
    model: target.label,
    duration_ms: durationMs,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    cost_usd: estimateLLMCostUSD(target.label, tokensIn, tokensOut),
  });
  if (error) {
    console.error("[AGENT] action_log insert failed:", error.message);
  }
  return new Response(
    JSON.stringify({
      success: true,
      output: answer.text,
      agent_name: turn.agentName,
      model: target.label,
      execution_time_ms: durationMs,
      tools_used: [],
      tool_log: [],
      conversation_id: turn.conversationId,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
