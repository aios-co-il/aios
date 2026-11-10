import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeDelegateToManus } from "../../executors/delegate-to-manus.ts";
import { executeSendMessageToManus } from "../../executors/send-message-to-manus.ts";
import { executeDelegateToGithubAgent } from "../../executors/delegate-to-github-agent.ts";
import { executeDelegateToSubagent } from "../../executors/delegate-to-subagent.ts";
import { executeGetSubagentResult } from "../../executors/get-subagent-result.ts";
import { executeDelegateParallel } from "../../executors/delegate-parallel.ts";
import { executeGetBatchResults } from "../../executors/get-batch-results.ts";

/** delegation tool routes; argument assertions retain the legacy tool boundary. */
export const delegationRoutes: Record<string, ToolRoute> = {
  delegate_to_manus: bindToolRoute(executeDelegateToManus),
  send_message_to_manus: bindToolRoute(executeSendMessageToManus),
  delegate_to_github_agent: bindToolRoute(executeDelegateToGithubAgent),
  delegate_to_subagent: bindToolRoute(executeDelegateToSubagent),
  get_subagent_result: bindToolRoute(executeGetSubagentResult),
  delegate_parallel: bindToolRoute(executeDelegateParallel),
  get_batch_results: bindToolRoute(executeGetBatchResults),
};
