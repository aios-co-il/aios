import type { RunState } from "./state.ts";
import { loadMcpTools } from "../../_shared/mcp-tools.ts";
import { shouldLoadMcpConnection } from "../../_shared/carmen-token-optimizer.ts";
import { isDevEscalationTool } from "../../_shared/dev-escalation-auth.ts";
import { isDevEscalationToolAllowed } from "../../_shared/dev-escalation-auth.ts";
/** load Run Mcp Tools in the original run order. */
export async function loadRunMcpTools(
  run: RunState,
): Promise<Response | string | void> {
  try {
    // The workshop loads no connector tools: they send, publish or change things outside
    // the board. isBlockedInWorkshop also refuses any mcp_ call made there.
    if (!run.pinSkillsOnly && !run.inWorkshop) {
      const disabledIntegrations = (run.agent.disabled_integrations ||
        []) as Array<string>;
      const mcp = await loadMcpTools(
        run.supabase,
        run.resolvedTenantId,
        run.agent_id,
        disabledIntegrations,
      );
      if (mcp.toolDefs.length > 0) {
        // 4b-i. Escalation agent filter
        // cursor escalation filter deploy marker
        // If metadata.escalation_agent is set, only expose MCP tools for the chosen escalation agent.
        // 'cursor'  → Cursor MCP only
        // 'claude'  → Claude MCP only
        // 'manus'   → Manus MCP only
        // 'grok'    → Grok Bot MCP only
        // 'none'    → no external escalation MCPs
        // 'all'/unset → keep everything (default, backward-compatible)
        const escalationAgent: string =
          run.agent.metadata?.escalation_agent || "all";
        /** Retains the original isEscalationMcp helper. */
        function isEscalationMcp(n: string) {
          return (
            n.startsWith("mcp_Claude__") ||
            n.startsWith("mcp_Manus__") ||
            n.startsWith("mcp_Cursor__") ||
            n.startsWith("mcp_Grok__")
          );
        }
        const forceLoadAllMcp =
          !run.tokenOptimize ||
          run.canEscalateDevFixes ||
          run.userAskedBackground ||
          run.userAskedManus ||
          run.userAskedGithubAgent;
        for (const t of mcp.toolDefs) {
          if (run.tokenOptimize && !forceLoadAllMcp) {
            const connSlug =
              String(t.name || "")
                .replace(/^mcp_/, "")
                .split("__")[0] || "";
            if (!shouldLoadMcpConnection(connSlug, run.cmd, false)) {
              continue;
            }
          }
          // Grok Bot is calling Carmen — do not expose Grok MCP back (ping-pong loop).
          if (
            run.input.surface === "grok_bot" &&
            t.name.startsWith("mcp_Grok__")
          ) {
            continue;
          }
          if (
            escalationAgent === "cursor" &&
            (t.name.startsWith("mcp_Claude__") ||
              t.name.startsWith("mcp_Manus__") ||
              t.name.startsWith("mcp_Grok__"))
          ) {
            continue;
          }
          if (
            escalationAgent === "claude" &&
            (t.name.startsWith("mcp_Manus__") ||
              t.name.startsWith("mcp_Cursor__") ||
              t.name.startsWith("mcp_Grok__"))
          ) {
            continue;
          }
          if (
            escalationAgent === "manus" &&
            (t.name.startsWith("mcp_Claude__") ||
              t.name.startsWith("mcp_Cursor__") ||
              t.name.startsWith("mcp_Grok__"))
          ) {
            continue;
          }
          if (
            escalationAgent === "grok" &&
            (t.name.startsWith("mcp_Claude__") ||
              t.name.startsWith("mcp_Cursor__") ||
              t.name.startsWith("mcp_Manus__"))
          ) {
            continue;
          }
          if (escalationAgent === "none" && isEscalationMcp(t.name)) {
            continue;
          }
          // 4b-ii. Hard auth: only allowlisted tiers may see/call coding-agent MCP tools.
          if (
            isDevEscalationTool(t.name) &&
            !isDevEscalationToolAllowed(t.name, run.devEscalationTier)
          ) {
            continue;
          }
          run.exposedMcpTools.push(t);
          if (!run.tokenOptimize || isEscalationMcp(t.name)) {
            run.promotedToolNames.add(t.name);
          }
          const exec = mcp.executors.get(t.name);
          if (exec) {
            run.mcpExecutors.set(t.name, exec);
          }
        }
        run.rebuildToolsForApi();
        console.log(
          `[AGENT] Loaded ${mcp.toolDefs.length} MCP tools from ${mcp.connectionsCount} connections (escalation=${escalationAgent}, dev_tier=${run.devEscalationTier ?? "none"}, exposed=${run.exposedMcpTools.length})`,
        );
      }
    }
  } catch (e: unknown) {
    console.error("[AGENT] MCP load failed:", (e as Error | null)?.message);
  }
}
