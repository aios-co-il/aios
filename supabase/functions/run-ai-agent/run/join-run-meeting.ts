import type { ToolResultMetadata } from "../tool-result-metadata.ts";
import type { RunState } from "./state.ts";
import { extractMeetingUrl } from "../../_shared/meeting-url.ts";
import { isBlockedInWorkshop } from "../../_shared/workshop/blocked-tools.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { resolveModel } from "../llm/model.ts";
/** join Run Meeting in the original run order. */
export async function joinRunMeeting(
  run: RunState,
): Promise<Response | string | void> {
  // Deterministic path: meeting join URL in message → dispatch Recall bot immediately.
  // Not from the workshop: a meeting link there is project material, not a request to join.
  const meetingUrl = extractMeetingUrl(String(run.command_text || ""));
  if (
    run.isCarmen &&
    !run.pinSkillsOnly &&
    meetingUrl &&
    !isBlockedInWorkshop("join_meeting_for_client", run.inWorkshop)
  ) {
    console.log(
      `[AGENT] Auto-dispatching meeting bot for URL: ${meetingUrl.slice(0, 80)}`,
    );
    const autoStart = Date.now();
    const execResult = (await run.dependencies.executeTool(
      "join_meeting_for_client",
      { meeting_url: meetingUrl },
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
    )) as ToolResultMetadata | null | undefined;
    const finalOutput = execResult?.success
      ? String(
          execResult.message ||
            "כרמן מצטרפת לפגישה. אשרו אותי בחדר ההמתנה אם נדרש.",
        )
      : `לא הצלחתי להצטרף לפגישה: ${execResult?.error || "שגיאה לא ידועה"}`;
    const executionTime = Date.now() - autoStart;
    if (run.serverConversationId && run.callerUserId) {
      const persistedMessages = [
        ...run.serverConversationHistory,
        { role: "user", content: String(run.command_text) },
        { role: "assistant", content: finalOutput },
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
    return new Response(
      JSON.stringify({
        success: !!execResult?.success,
        output: finalOutput,
        agent_name: run.agent.name,
        model: resolveModel(
          run.modelOverride || run.agent.engine || "gemini-3-flash",
        ),
        execution_time_ms: executionTime,
        tools_used: ["join_meeting_for_client"],
        tool_log: [
          {
            tool: "join_meeting_for_client",
            args: { meeting_url: meetingUrl },
            result: execResult,
          },
        ],
        auto_meeting_join: true,
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
