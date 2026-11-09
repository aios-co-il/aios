import type { RunState } from "./state.ts";
import { isDeterministicApprovalPick } from "../approvals/resolve.ts";
import { runApprovalExecutor } from "../approvals/executor.ts";
import { formatApprovalExecutionReply } from "../../_shared/wa-approval-flow.ts";
import { formatApprovalPickReply } from "../approvals/chat-text.ts";
import { resolveModel } from "../llm/model.ts";
/** execute Run Approval in the original run order. */
export async function executeRunApproval(
  run: RunState,
): Promise<Response | string | void> {
  // Deterministic path: a short approval reply is answered without the LLM —
  // run the bound (or code-picked) row, refuse, or list the candidates.
  if (
    run.isCarmen &&
    !run.pinSkillsOnly &&
    run.mayDecideApprovals &&
    run.userSaidApprove &&
    run.approvalPick &&
    isDeterministicApprovalPick(
      run.approvalPick,
      String(run.command_text || ""),
    )
  ) {
    console.log(
      `[AGENT] Approval reply: ${run.approvalPick.kind}${run.pendingForConfirm ? ` → executing ${run.pendingForConfirm.id}` : ""}`,
    );
    const autoStart = Date.now();
    const execResult = run.pendingForConfirm
      ? await runApprovalExecutor(run.pendingForConfirm.id, run.callerUserId)
      : null;
    const finalOutput = run.pendingForConfirm
      ? formatApprovalExecutionReply(execResult, run.pendingForConfirm)
      : formatApprovalPickReply(run.approvalPick);
    const executionTime = Date.now() - autoStart;
    if (run.serverConversationId && run.callerUserId) {
      const persistedMessages = [
        ...run.serverConversationHistory,
        { role: "user", content: String(run.command_text) },
        { role: "assistant", content: String(finalOutput || "") },
      ].slice(-60);
      await run.supabase
        .from("ai_conversations")
        .update({
          messages: persistedMessages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.serverConversationId)
        .eq("user_id", run.callerUserId)
        .eq("tenant_id", run.resolvedTenantId);
    }
    if (run.input.emit && finalOutput) {
      run.input.emit({ type: "token", content: finalOutput });
    }
    try {
      await run.supabase.from("agent_action_log").insert({
        tenant_id: run.resolvedTenantId,
        agent_id: run.agent_id as string,
        action_type: "agent_turn",
        status: "success",
        action_details: {
          surface: run.input.surface,
          command_preview: String(run.command_text || "").slice(0, 240),
          tools_used: execResult ? ["execute_pending_approval"] : [],
          tool_count: execResult ? 1 : 0,
          output_preview: String(finalOutput || "").slice(0, 600),
          caller_role: run.callerRole,
          caller_campaigner_id: run.callerCampaignerId,
          auto_approval_execute: !!execResult,
          approval_pick: run.approvalPick.kind,
          approval_id:
            "row" in run.approvalPick ? run.approvalPick.row.id : null,
          exec_success: !!(execResult && execResult.success),
        },
        user_id: run.callerUserId,
        tool_calls: execResult ? 1 : 0,
        duration_ms: executionTime,
      });
    } catch {
      /* ignore */
    }
    return new Response(
      JSON.stringify({
        success: true,
        output: finalOutput,
        agent_name: run.agent.name,
        model: resolveModel(
          run.modelOverride || run.agent.engine || "gemini-3-flash",
        ),
        execution_time_ms: executionTime,
        tools_used: execResult ? ["execute_pending_approval"] : [],
        tool_log:
          execResult && run.pendingForConfirm
            ? [
                {
                  tool: "execute_pending_approval",
                  args: { approval_id: run.pendingForConfirm.id },
                  result: execResult,
                },
              ]
            : [],
        auto_approval_execute: !!execResult,
      }),
      {
        headers: {
          ...run.dependencies.corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
