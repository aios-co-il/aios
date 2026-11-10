import type { RunState } from "./state.ts";
import { isWorkshopTool } from "../../_shared/workshop-tools.ts";
import { ROLE_PERSONA } from "../../_shared/workshop/roles.ts";
import { skinForTool } from "../../_shared/workshop/artifacts.ts";
import { pulseSurfacePrefersWhatsAppDigest } from "../../_shared/campaign-pulse.ts";
import { REFRESH_PULSE_TOOL_NAME } from "../../_shared/carmen/pulse-tools.ts";
import { buildPulseRefreshDigestReply } from "../pulse-refresh/note.ts";
import type { ToolCall } from "../stream-completion.ts";
import type { ModelToolExecution, RoundToolState } from "./loop-contracts.ts";
/** Records and emits a tool result before choosing deterministic reply shortcuts. */
export function processModelToolResult(
  run: RunState,
  round: number,
  tc: ToolCall,
  execution: ModelToolExecution,
  tools: RoundToolState,
): void {
  const { toolName, toolArgs, result } = execution;
  run.toolLog.push({ tool: toolName, args: toolArgs, result });
  tools.toolResults.push({
    role: "tool",
    tool_call_id: tc.id,
    content: JSON.stringify(result),
  });
  // Emit tool_result so AIOS can link e.g. delegate_to_subagent → sub_task_id back to the chat.
  if (run.input.emit) {
    const subTaskId =
      (result && typeof result === "object" && result.sub_task_id) || undefined;
    run.input.emit({
      type: "tool_result",
      tool: toolName,
      sub_task_id: subTaskId,
      ok: !(result && result.error),
      error: (result && result.error) || undefined,
    });
    // Studio tools ask the open Creative studio to run one of its own buttons
    // (or focus a scene / variation); the studio chat executes it on screen.
    const uiAction =
      result && typeof result === "object" ? result.ui_action : undefined;
    if (uiAction && typeof uiAction === "object") {
      run.input.emit({
        type: "ui_action",
        tool: toolName,
        action: uiAction,
      });
    }
    // Workshop tools tell the board what appeared and which skin is doing the work.
    const workshopEvent =
      result && typeof result === "object" ? result.workshop : undefined;
    if (workshopEvent && typeof workshopEvent === "object") {
      run.input.emit({
        type: "workshop",
        tool: toolName,
        ...workshopEvent,
      });
    }
    const skinSlug =
      run.workshopRoleForRun && isWorkshopTool(toolName)
        ? ROLE_PERSONA[run.workshopRoleForRun]
        : skinForTool(toolName);
    if (skinSlug) {
      run.input.emit({ type: "skin", slug: skinSlug, tool: toolName });
    }
  }
  if (
    round === 0 &&
    toolName === "get_latest_campaign_pulse" &&
    run.isStoredPulseRequest &&
    pulseSurfacePrefersWhatsAppDigest(run.input.surface) &&
    typeof result?.whatsapp_digest === "string" &&
    result.whatsapp_digest.trim()
  ) {
    tools.pulseDigestShortcut = result.whatsapp_digest.trim();
  }
  if (
    round === 0 &&
    toolName === REFRESH_PULSE_TOOL_NAME &&
    run.pulseRefreshRoute.digestShortcut
  ) {
    tools.pulseDigestShortcut = buildPulseRefreshDigestReply(result);
  }
  // A workshop question or budget request is sent to the user exactly as the server
  // wrote it (buttons included) and the turn ends; a model rewording it dropped questions.
  if (
    isWorkshopTool(toolName) &&
    typeof result?.say_to_user === "string" &&
    result.say_to_user.trim()
  ) {
    const say = result.say_to_user.trim();
    if (result.needs_budget === true) {
      tools.budgetSay = say;
    } else if (!tools.sayToUser.includes(say)) {
      tools.sayToUser.push(say);
    }
  }
}
