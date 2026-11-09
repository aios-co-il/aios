import type { ToolDef, McpExecutor } from "./contracts.ts";
import type { RunState } from "./state.ts";
import { buildToolApiEntries } from "../../_shared/carmen-token-optimizer.ts";
import { approvalScopedTools } from "../approvals/decision-scope.ts";
import { isDevEscalationTool } from "../../_shared/dev-escalation-auth.ts";
import { isDevEscalationToolAllowed } from "../../_shared/dev-escalation-auth.ts";
import { isSuperAdminRole } from "../../_shared/openai-billing.ts";
/** prepare Run Tool Api in the original run order. */
export async function prepareRunToolApi(
  run: RunState,
): Promise<Response | string | void> {
  run.exposedMcpTools = [];
  run.toolsForAPI = [];
  run.rebuildToolsForApi = () => {
    run.toolsForAPI.length = 0;
    run.toolsForAPI.push(
      ...buildToolApiEntries(
        approvalScopedTools(run.filteredTools, run.mayDecideApprovals),
        run.promotedToolNames,
        run.tokenOptimize,
      ),
    );
    run.toolsForAPI.push(
      ...buildToolApiEntries(
        run.exposedMcpTools,
        run.promotedToolNames,
        run.tokenOptimize,
      ),
    );
  };
  run.rebuildToolsForApi();
  run.expandAgentTools = (
    extra: Array<{
      name: string;
      description?: string;
      parameters?: ToolDef["parameters"];
    }>,
  ) => {
    for (const t of extra) {
      if (!t?.name) {
        continue;
      }
      run.promotedToolNames.add(t.name);
      if (!run.filteredTools.some((ft) => ft.name === t.name)) {
        run.filteredTools.push(t);
      }
    }
    run.rebuildToolsForApi();
  };
  // Unauthorized callers must not see native GitHub-agent delegation either.
  if (!run.canEscalateDevFixes) {
    run.filteredTools = run.filteredTools.filter(
      (t) => !isDevEscalationTool(t.name),
    );
    run.rebuildToolsForApi();
  } else if (run.devEscalationTier === "bugfix") {
    run.filteredTools = run.filteredTools.filter(
      (t) =>
        !isDevEscalationTool(t.name) ||
        isDevEscalationToolAllowed(t.name, run.devEscalationTier),
    );
    run.rebuildToolsForApi();
  }
  // OpenAI billing/usage is super_admin-only — hide from everyone else.
  if (!isSuperAdminRole(run.callerRole)) {
    run.filteredTools = run.filteredTools.filter(
      (t) => t.name !== "get_openai_billing_status",
    );
    run.rebuildToolsForApi();
  }
  run.mcpExecutors = new Map<string, McpExecutor>();
}
