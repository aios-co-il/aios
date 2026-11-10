import type { RunState } from "./state.ts";
import { nameChatTopicLater } from "../../_shared/carmen/chat-topic.ts";
import type { FastLaneChannel } from "../fast-lane/eligibility.ts";
import { isGroupChat } from "../finding-draft/reply.ts";
import { fastLaneFits } from "../fast-lane/eligibility.ts";
import { chatTurns } from "../fast-lane/answer.ts";
/** load Run Conversation in the original run order. */
export async function loadRunConversation(
  run: RunState,
): Promise<Response | string | void> {
  run.serverConversationId = null;
  run.turnStartedAt = new Date().toISOString();
  run.appChatTurn =
    run.input.request.authKind === "user" &&
    (run.input.surface === "internal_chat" || run.input.surface === "aios");
  run.serverConversationHistory = [];
  if (
    (run.input.surface === "internal_chat" ||
      run.input.surface === "aios" ||
      run.input.surface === "grok_bot") &&
    run.callerUserId &&
    !run.automationRun
  ) {
    if (run.conversation_id) {
      const { data: existingConversation } = await run.supabase
        .from("ai_conversations")
        .select("id, messages")
        .eq("id", run.conversation_id)
        .eq("user_id", run.callerUserId)
        .eq("tenant_id", run.resolvedTenantId)
        .maybeSingle()
        .returns<{ id: string; messages: unknown }>();
      if (existingConversation) {
        run.serverConversationId = existingConversation.id;
        run.serverConversationHistory = (
          Array.isArray(existingConversation.messages)
            ? existingConversation.messages
            : []
        )
          .filter((m) => m?.role === "user" || m?.role === "assistant")
          .map((m) => ({
            role: m.role,
            content: String(m.content || ""),
          }))
          .slice(-24);
      }
    }
    if (!run.serverConversationId) {
      const clientHistory = (
        Array.isArray(run.conversation_history) ? run.conversation_history : []
      )
        .filter((m) => m?.role === "user" || m?.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content || ""),
        }))
        .slice(-24);
      const { data: createdConversation } = await run.supabase
        .from("ai_conversations")
        .insert({
          user_id: run.callerUserId,
          tenant_id: run.resolvedTenantId,
          title: String(run.command_text).slice(0, 60),
          messages: clientHistory,
        })
        .select("id")
        .single();
      if (createdConversation?.id) {
        run.serverConversationId = createdConversation.id;
        run.serverConversationHistory = clientHistory;
        nameChatTopicLater(run.supabase, {
          conversationId: createdConversation.id,
          firstMessage: String(run.command_text),
          provisional: String(run.command_text).slice(0, 60),
        });
      }
    }
    if (run.serverConversationId && run.input.emit) {
      run.input.emit({ type: "conversation_id", id: run.serverConversationId });
    }
  }
  // A quick model answers small talk and what the org brief already covers before the full
  // setup (memory, skills, tools) runs; anything else falls through unchanged (fast-lane/).
  const fastLaneChannel: FastLaneChannel | null =
    run.input.emit &&
    run.appChatTurn &&
    run.serverConversationId &&
    run.callerUserId
      ? "app_chat"
      : // A team member (matched by the service-only caller phone) writing to Carmen 1:1.
        run.input.surface === "whatsapp" &&
          run.wa_notify &&
          !isGroupChat(run.wa_notify) &&
          run.callerCampaignerId
        ? "whatsapp_staff"
        : null;
  if (
    fastLaneFits({
      message: String(run.command_text),
      channel: fastLaneChannel,
      isCarmen: run.isCarmenAgent,
      pinned: Boolean(
        run.input.brainEngine ||
        run.modelOverride ||
        run.pinSkillsOnly ||
        run.inWorkshopRequest ||
        run.task_mode ||
        run.automationRun ||
        run.input.bodyJson.carmen_automation ||
        run.findingDraftReply.shortCode ||
        run.findingDraftReply.approveCode ||
        (Array.isArray(run.task_skills) && run.task_skills.length > 0),
      ),
    })
  ) {
    const fastReply = await run.dependencies.tryFastLane(
      run.supabase,
      run.input.emit,
      {
        tenantId: run.resolvedTenantId,
        userId: run.callerUserId,
        callerName: run.callerName,
        agentId: run.agent_id as string,
        agentName: run.agent.name || "כרמן",
        conversationId: run.serverConversationId,
        history:
          fastLaneChannel === "app_chat"
            ? run.serverConversationHistory
            : chatTurns(run.conversation_history),
        message: String(run.command_text),
        surface: run.input.surface,
        caller: {
          userId: run.callerUserId,
          role: run.callerRole,
          managedAgencyIds: run.callerManagedAgencyIds,
        },
      },
    );
    if (fastReply) {
      return fastReply;
    }
  }
}
