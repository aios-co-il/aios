import type { McpExecutor } from "./contracts.ts";
import type { RunState } from "./state.ts";
import { lastAssistantText } from "../../_shared/workshop/tapped-answers.ts";
import { workshopToolRefusal } from "../../_shared/workshop/blocked-tools.ts";
import { searchToolsFromIndex } from "../../_shared/carmen-token-optimizer.ts";
import { isDevEscalationTool } from "../../_shared/dev-escalation-auth.ts";
import { isDevEscalationToolAllowed } from "../../_shared/dev-escalation-auth.ts";
import { DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE } from "../../_shared/dev-escalation-auth.ts";
import { DEV_ESCALATION_REFUSAL_HE } from "../../_shared/dev-escalation-auth.ts";
import { isApprovalDecisionTool } from "../approvals/decision-scope.ts";
import { approvalDecisionRefusal } from "../approvals/decision-scope.ts";
import { directDevSendRefusal } from "../dev-task-send-rules.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { workshopClientIdFrom } from "../../_shared/workshop/view-client.ts";
import { workshopItemIdFrom } from "../../_shared/workshop/role-project.ts";
import { workshopArtifactIdFrom } from "../../_shared/workshop/role-project.ts";
import { bindApprovalToConversation } from "../approvals/binding.ts";
import type { ToolCall } from "../stream-completion.ts";
import type { ExecutedToolResult } from "./contracts.ts";
import type { DevSendTurn, ModelToolExecution } from "./loop-contracts.ts";
/** Applies workshop, escalation and approval checks before executing and binding one tool. */
export async function executeModelTool(
  run: RunState,
  tc: ToolCall,
  devSendTurn: DevSendTurn,
): Promise<ModelToolExecution> {
  const toolName = tc.function.name;
  let toolArgs: Record<string, unknown> = {};
  try {
    toolArgs = JSON.parse(tc.function.arguments || "{}");
  } catch {
    /* ignore */
  }
  console.log(`[AGENT] Tool call: ${toolName}`);
  if (run.input.emit) {
    run.input.emit({ type: "tool_call", tool: toolName, args: toolArgs });
  }
  let result: ExecutedToolResult;
  // A workshop tap is never an approval, and nothing leaves the board from the workshop;
  // outside it a workshop tool has no board. Either way, even a tool never offered.
  const workshopRefusal = workshopToolRefusal(toolName, run.inWorkshop);
  try {
    // Defense in depth: even if a tool slipped into the schema, refuse
    // coding-agent escalations outside the caller's tier (full vs bugfix).
    if (run.pinSkillsOnly) {
      result = {
        error: "isolated_session",
        message: "סשן מבודד — כלים כבויים.",
      };
    } else if (workshopRefusal) {
      result = workshopRefusal;
    } else if (toolName === "search_agent_tools") {
      const discovered = (
        await searchToolsFromIndex(
          run.supabase,
          String(toolArgs.query || run.command_text || ""),
          run.toolPoolBeforeRouting,
          typeof toolArgs.limit === "number" ? toolArgs.limit : 12,
        )
      ).filter((tool) => run.workshopToolAllowed(tool.name));
      run.expandAgentTools(discovered);
      result = {
        success: true,
        count: discovered.length,
        tools: discovered.map((t) => ({
          name: t.name,
          description: (t.description || "").slice(0, 160),
        })),
        message:
          discovered.length > 0
            ? "הכלים זמינים מסבב הבא — המשיכי לבצע."
            : "לא נמצאו כלים תואמים — נסי ניסוח אחר.",
      };
    } else if (
      isDevEscalationTool(toolName) &&
      !isDevEscalationToolAllowed(toolName, run.devEscalationTier)
    ) {
      result = {
        error: "dev_escalation_forbidden",
        message:
          run.devEscalationTier === "bugfix"
            ? DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE
            : DEV_ESCALATION_REFUSAL_HE,
      };
    } else if (!run.mayDecideApprovals && isApprovalDecisionTool(toolName)) {
      result = approvalDecisionRefusal(
        toolName,
        run.input.bodyJson,
        run.input.surface,
      );
    } else if (directDevSendRefusal(toolName, devSendTurn, toolArgs)) {
      // A coding agent starts only after the user's yes to Carmen's offer.
      result = directDevSendRefusal(toolName, devSendTurn, toolArgs);
    } else if (run.mcpExecutors.has(toolName)) {
      result = await (run.mcpExecutors.get(toolName) as McpExecutor)(toolArgs);
    } else {
      // Prefer profile UUID resolved from WhatsApp phone; never pass literal "system" into uuid columns.
      result = await run.dependencies.executeTool(
        toolName,
        toolArgs,
        run.supabase,
        run.resolvedTenantId,
        run.callerUserId || asUuidOrNull(run.resolvedUserId),
        run.callerCampaignerId,
        run.agent_id,
        run.callerRole,
        run.callerManagedAgencyIds,
        run.callerPhone,
        run.wa_notify,
        run.input.surface,
        run.serverConversationId,
        {
          turnId: run.turnId,
          userText: String(run.command_text ?? ""),
          viewClientId: run.inWorkshop
            ? workshopClientIdFrom(run.input.bodyJson)
            : null,
          openItemId: run.inWorkshop
            ? workshopItemIdFrom(run.input.bodyJson)
            : null,
          markedArtifactId: run.inWorkshop
            ? workshopArtifactIdFrom(run.input.bodyJson)
            : null,
          // Every chat: a dev-task yes is read only from the user's own AIOS chat turn.
          devTaskTurn: {
            turnStartedAt: run.turnStartedAt,
            appChatUser: run.appChatTurn,
            lastAssistantText: lastAssistantText(run.conversation_history),
          },
          lastAssistant: lastAssistantText(run.conversation_history),
        },
        run.input.request.origin ?? null,
        run.humanRequesterUserId,
        run.findingDraftReply,
      );
      if (result?.pending_approval && result?.approval_id) {
        await bindApprovalToConversation(
          run.supabase,
          run.resolvedTenantId,
          String(result.approval_id),
          run.callerUserId || asUuidOrNull(run.resolvedUserId),
          run.approvalConversation,
        );
      }
    }
    console.log(`[AGENT] Tool ${toolName} OK`);
  } catch (e: unknown) {
    result = { error: (e as Error).message };
    console.error(`[AGENT] Tool ${toolName} ERROR: ${(e as Error).message}`);
  }
  return { toolName, toolArgs, result };
}
