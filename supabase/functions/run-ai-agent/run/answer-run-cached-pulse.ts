import type { RunState } from "./state.ts";
import { pulseSurfacePrefersWhatsAppDigest } from "../../_shared/campaign-pulse.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { resolveModel } from "../llm/model.ts";
/** answer Run Cached Pulse in the original run order. */
export async function answerRunCachedPulse(
  run: RunState,
): Promise<Response | string | void> {
  // Deterministic path: WhatsApp pulse request → return colorful cached digest verbatim.
  // It does not check the caller yet, so an unidentified sender gets the
  // tenant digest too (AIO-248).
  if (
    run.isCarmen &&
    run.isStoredPulseRequest &&
    pulseSurfacePrefersWhatsAppDigest(run.input.surface)
  ) {
    console.log(
      "[AGENT] Auto-returning cached campaign pulse digest for WhatsApp",
    );
    const autoStart = Date.now();
    const pulseResult = await run.dependencies.executeTool(
      "get_latest_campaign_pulse",
      {},
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
    );
    const digest =
      typeof pulseResult?.whatsapp_digest === "string"
        ? pulseResult.whatsapp_digest.trim()
        : "";
    const finalOutput =
      digest || "אין בדיקת דופק זמינה כרגע — נסה שוב אחרי הסנכרון הבא.";
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
        success: !!digest,
        output: finalOutput,
        agent_name: run.agent.name,
        model: resolveModel(
          run.modelOverride || run.agent.engine || "gemini-3-flash",
        ),
        execution_time_ms: executionTime,
        tools_used: ["get_latest_campaign_pulse"],
        tool_log: [
          {
            tool: "get_latest_campaign_pulse",
            args: {},
            result: pulseResult,
          },
        ],
        auto_pulse_digest: true,
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
