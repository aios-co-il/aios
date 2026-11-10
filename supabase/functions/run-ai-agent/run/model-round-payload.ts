import type { RunState } from "./state.ts";
import { capToolsForTarget } from "../llm/tool-cap.ts";
import { messagesForProvider } from "../stream-completion.ts";
import { canStreamCompletion } from "../stream-completion.ts";
import { pulseRefreshToolChoice } from "../pulse-refresh/routing.ts";
import { extractMeetingUrl } from "../../_shared/meeting-url.ts";
import type { CompletionRequest } from "./loop-contracts.ts";
/** Builds the same round request anew for each provider retry. */
export function buildRoundPayload(
  run: RunState,
  round: number,
): CompletionRequest {
  const cappedTools = capToolsForTarget(run.llm, run.toolsForAPI);
  const payload: CompletionRequest = {
    model: run.llm.model,
    messages: messagesForProvider(run.messages, run.llm.provider),
  };
  const temp = run.safeTemp ?? run.llm.temperature;
  if (temp !== undefined) {
    payload.temperature = temp;
  }
  if (run.llm.maxTokens) {
    payload.max_tokens = run.llm.maxTokens;
  }
  if (cappedTools.length > 0) {
    payload.tools = cappedTools;
  }
  // A chat that shows the reply live gets the text as the model writes it (AIO-509).
  const streamThisRound = !!run.input.emit && canStreamCompletion(run.llm);
  if (streamThisRound) {
    payload.stream = true;
    payload.stream_options = { include_usage: true };
  }
  if (
    round === 0 &&
    run.isStoredPulseRequest &&
    cappedTools.some((t) => t.function?.name === "get_latest_campaign_pulse")
  ) {
    payload.tool_choice = {
      type: "function",
      function: { name: "get_latest_campaign_pulse" },
    };
  }
  const refreshChoice = pulseRefreshToolChoice(
    run.pulseRefreshRoute,
    cappedTools,
  );
  if (round === 0 && refreshChoice) {
    payload.tool_choice = refreshChoice;
  }
  if (
    round === 0 &&
    extractMeetingUrl(String(run.command_text || "")) &&
    cappedTools.some((t) => t.function?.name === "join_meeting_for_client")
  ) {
    payload.tool_choice = {
      type: "function",
      function: { name: "join_meeting_for_client" },
    };
  }
  return payload;
}
