import { loadProviderChain } from "./load-provider-chain.ts";
import { createLoopTextEmitter } from "./emit-loop-text.ts";
import { requestModelRound } from "./request-model-round.ts";
import { executeModelTool } from "./execute-model-tool.ts";
import { processModelToolResult } from "./process-model-tool-result.ts";
import type { RoundToolState } from "./loop-contracts.ts";
import type { RunState } from "./state.ts";

import { lastAssistantText } from "../../_shared/workshop/tapped-answers.ts";
import { readStreamedCompletion } from "../stream-completion.ts";
import { shouldNudgeSilentTurn } from "../../_shared/workshop/reply.ts";
import { SILENT_TURN_NUDGE } from "../../_shared/workshop/reply.ts";
import { fallbackReply } from "../../_shared/workshop/reply.ts";
import { stoppedAtStepLimit } from "../../_shared/workshop/reply.ts";
/** run Model Loop in the original run order. */
export async function runModelLoop(
  run: RunState,
): Promise<Response | string | void> {
  // Route to the org's own LLM provider(s) using the keys stored in the "llm"
  // integration. Build a fallback chain so Carmen automatically continues on the
  // next funded provider if the primary runs out of quota/credit mid-request.
  const chain = await loadProviderChain(run);
  // Models often repeat their mid-loop text ("creating the image…") in the
  // final answer; the client joins tokens, so send each text once, apart.
  const emittedTexts: Array<string> = [];
  /** Retains the original emitText helper. */
  const emitText = createLoopTextEmitter(run.input.emit, emittedTexts);
  run.usageTokensIn = 0;
  run.usageTokensOut = 0;
  // A tool that starts a coding agent runs only on the user's yes to Carmen's offer.
  const devSendTurn = {
    appChatUser: run.appChatTurn,
    userText: String(run.command_text ?? ""),
    lastAssistantText: lastAssistantText(run.conversation_history),
  };
  let silentNudges = 0;
  let roundsRun = 0;
  for (let round = 0; round < run.maxRounds; round++) {
    roundsRun = round + 1;
    // Provider failover: try the active provider; on a quota/credit error, advance
    // to the next provider in the chain and retry THIS round (no round consumed).
    const res = await requestModelRound(run, chain, round);
    let streamedText = "";
    const data =
      res.headers.get("content-type")?.includes("text/event-stream") && res.body
        ? await readStreamedCompletion(res.body, (delta) => {
            // Same separation as emitText: a new text after earlier ones starts apart.
            const lead = !streamedText && emittedTexts.length > 0 ? "\n\n" : "";
            streamedText += delta;
            run.input.emit?.({ type: "token", content: lead + delta });
          }).then(({ message, usage }) => ({
            usage,
            choices: [{ message }],
          }))
        : await res.json();
    // Text already streamed counts as sent, so emitText does not send it again.
    if (streamedText.trim()) {
      emittedTexts.push(streamedText.trim());
    }
    if (data?.usage) {
      run.usageTokensIn +=
        data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0;
      run.usageTokensOut +=
        data.usage.completion_tokens ?? data.usage.output_tokens ?? 0;
    }
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      break;
    }
    run.messages.push(msg);
    // No tool calls → done
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      if (
        !String(msg.content || "").trim() &&
        silentNudges < 1 &&
        shouldNudgeSilentTurn(run.toolLog)
      ) {
        silentNudges += 1;
        run.messages.push({
          role: "user",
          content: SILENT_TURN_NUDGE,
        });
        continue;
      }
      run.finalOutput = msg.content || "";
      console.log(
        `[AGENT] Done after ${round + 1} rounds, output length=${run.finalOutput.length}`,
      );
      // Stream the final assistant text in one chunk so AIOS frontends can render progressively.
      if (run.input.emit && run.finalOutput) {
        emitText(run.finalOutput);
      }
      break;
    }
    // Mid-loop assistant text (assistant decided to talk while also calling tools) — stream it too.
    if (
      run.input.emit &&
      typeof msg.content === "string" &&
      msg.content.length > 0
    ) {
      emitText(msg.content);
    }
    // Execute tool calls — promote any called tool to full schema for the next round.
    const tools: RoundToolState = {
      toolResults: [],
      pulseDigestShortcut: null,
      sayToUser: [],
      budgetSay: null,
    };
    if (run.tokenOptimize && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        run.promotedToolNames.add(tc.function.name);
      }
      run.rebuildToolsForApi();
    }
    for (const tc of msg.tool_calls) {
      const execution = await executeModelTool(run, tc, devSendTurn);
      processModelToolResult(run, round, tc, execution, tools);
    }
    run.messages.push(...tools.toolResults);
    if (tools.budgetSay) {
      tools.sayToUser.push(tools.budgetSay);
    }
    if (tools.sayToUser.length) {
      tools.pulseDigestShortcut = tools.sayToUser.join("\n\n");
    }
    if (tools.pulseDigestShortcut) {
      run.finalOutput = tools.pulseDigestShortcut;
      // emitText puts it apart from any text the model already sent this turn.
      emitText(run.finalOutput);
      break;
    }
  }
  if (!String(run.finalOutput || "").trim()) {
    const fallback = fallbackReply(run.toolLog, {
      outOfSteps: stoppedAtStepLimit(
        roundsRun,
        run.maxRounds,
        run.messages[run.messages.length - 1]?.role,
      ),
    });
    if (fallback) {
      run.finalOutput = fallback;
      if (run.input.emit) {
        run.input.emit({ type: "token", content: fallback });
      }
    }
  }
}
