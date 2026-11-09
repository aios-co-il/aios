import { initializeRun } from "./initialize-run.ts";
import { loadRunAgent } from "./load-run-agent.ts";
import { resolveRunCaller } from "./resolve-run-caller.ts";
import { loadRunConversation } from "./load-run-conversation.ts";
import { captureRunInstruction } from "./capture-run-instruction.ts";
import { loadRunTenantData } from "./load-run-tenant-data.ts";
import { loadRunMemory } from "./load-run-memory.ts";
import { buildRunTenantContext } from "./build-run-tenant-context.ts";
import { buildRunBasePrompt } from "./build-run-base-prompt.ts";
import { appendRunSkins } from "./append-run-skins.ts";
import { appendRunPolicies } from "./append-run-policies.ts";
import { scopeRunTools } from "./scope-run-tools.ts";
import { routeRunTools } from "./route-run-tools.ts";
import { prepareRunToolApi } from "./prepare-run-tool-api.ts";
import { loadRunMcpTools } from "./load-run-mcp-tools.ts";
import { configureRunModel } from "./configure-run-model.ts";
import { matchRunSkills } from "./match-run-skills.ts";
import { appendRunStandingRules } from "./append-run-standing-rules.ts";
import { answerRunDevTaskOffer } from "./answer-run-dev-task-offer.ts";
import { pickRunApproval } from "./pick-run-approval.ts";
import { executeRunApproval } from "./execute-run-approval.ts";
import { joinRunMeeting } from "./join-run-meeting.ts";
import { answerRunCachedPulse } from "./answer-run-cached-pulse.ts";
import { prepareRunMessages } from "./prepare-run-messages.ts";
import { runModelLoop } from "./run-model-loop.ts";
import { persistRunCompletion } from "./persist-run-completion.ts";
import type { RunState } from "./state.ts";
/** Executes named run stages in their original order, preserving early returns. */
export async function runAgent(run: RunState): Promise<Response | string> {
  const stages = [
    initializeRun,
    loadRunAgent,
    resolveRunCaller,
    loadRunConversation,
    captureRunInstruction,
    loadRunTenantData,
    loadRunMemory,
    buildRunTenantContext,
    buildRunBasePrompt,
    appendRunSkins,
    appendRunPolicies,
    scopeRunTools,
    routeRunTools,
    prepareRunToolApi,
    loadRunMcpTools,
    configureRunModel,
    matchRunSkills,
    appendRunStandingRules,
    answerRunDevTaskOffer,
    pickRunApproval,
    executeRunApproval,
    joinRunMeeting,
    answerRunCachedPulse,
    prepareRunMessages,
    runModelLoop,
    persistRunCompletion,
  ];
  for (const stage of stages) {
    const response = await stage(run);
    if (response !== undefined) {
      return response;
    }
  }
  throw new Error("Run stages completed without a response");
}
