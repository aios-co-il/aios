import type { DbClient } from "../../_shared/supabase-clients.ts";
import { loadCarmenAgent } from "../../_shared/carmen/load-carmen-agent.ts";
import type { Json } from "../../_shared/database.types.ts";
import { executeApprovedDirectTool } from "./execute-approved.ts";
import { json } from "./response.ts";
import type { DirectToolRequest } from "./types.ts";
import type { RunBody } from "../run/contracts.ts";
import type { ToolExecutor } from "../tool-execution/route.ts";
import { resolveDirectCaller } from "./caller.ts";
import { executeTool } from "../tool-execution/execute.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { keepCarmenPulseTools } from "../pulse-refresh/tool-pool.ts";
import { directToolPool } from "../../_shared/carmen-direct-tools.mjs";
import { ALL_TOOLS } from "../tool-catalog.ts";
import { MANAGER_ROLES } from "../../_shared/carmen/manager-roles.ts";
import { classifyDirectTool } from "../../_shared/carmen-direct-tools.mjs";

// ===========================
// DIRECT TOOL MODE (carmen-tools-mcp)
// ===========================
// Coding agents (Claude Direct / Cursor Direct) call Carmen's tools without her LLM.
// Same executeTool, same role scoping and per-tool approval gates; tools that would
// act immediately but are sensitive are queued for approval instead (see
// _shared/carmen-direct-tools.mjs). Service-role callers only.
/** Handles service-only direct calls, keeping approved execution ahead of ordinary tool resolution. */
export async function handleDirectTool(
  bodyJson: DirectToolBody,
  supabase: DbClient,
  dependencies: DirectToolDependencies = { executeTool },
): Promise<Response> {
  const req = bodyJson.direct_tool || {};
  const caller =
    String(req.caller || "agent")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 40) || "agent";

  if (req.action === "execute_approved") {
    return executeApprovedDirectTool(req, supabase, dependencies.executeTool);
  }

  const tenantId = String(bodyJson.tenant_id || "");
  const userId = asUuidOrNull(bodyJson.user_id);

  if (!tenantId || !userId) {
    return json({ error: "tenant_id and user_id are required" }, 400);
  }

  const agent = await loadCarmenAgent(supabase, tenantId, { activeOnly: true });

  if (!agent) {
    return json({ error: "No active Carmen agent for tenant" }, 404);
  }

  const scope = await resolveDirectCaller(supabase, tenantId, userId);
  const disabledTools: Array<string> = agent.disabled_tools || [];
  // The same pulse tools as Carmen's chat, past a narrow allowed_tools.
  const pool = keepCarmenPulseTools(
    directToolPool(ALL_TOOLS, {
      allowedTools: agent.allowed_tools || [],
      disabledTools,
      isManager: !!scope.role && MANAGER_ROLES.includes(scope.role),
    }),
    ALL_TOOLS,
    { isCarmen: true, disabledTools },
  );

  if (req.action === "list") {
    return json({
      tools: pool.map((t) => ({
        ...t,
        requires_approval: classifyDirectTool(t.name) === "approval",
      })),
    });
  }

  if (req.action !== "call") {
    return json({ error: "unknown direct_tool action" }, 400);
  }

  const name = String(req.name || "");
  const args = req.args && typeof req.args === "object" ? req.args : {};

  if (!pool.some((t) => t.name === name)) {
    return json({ error: `tool_not_available: ${name}` }, 403);
  }

  if (classifyDirectTool(name) === "approval") {
    const { data: aq, error: aqErr } = await supabase
      .from("agent_approval_queue")
      .insert({
        tenant_id: tenantId,
        agent_id: agent.id,
        requested_by: userId,
        action_type: "agent_direct_tool",
        title: `${caller} → ${name}`,
        description: `${caller} ביקש להפעיל את ${name} ישירות — דורש אישור`,
        tool_name: name,
        tool_input: args as Json,
        context: { caller, caller_role: scope.role },
        status: "pending",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (aqErr) {
      return json({ error: aqErr.message }, 500);
    }

    return json({
      result: {
        pending_approval: true,
        approval_id: aq.id,
        message:
          "Queued for David's approval (AIOS approvals). Do not retry or work around it; tell David what you queued.",
      },
    });
  }

  try {
    const result = await dependencies.executeTool(
      name,
      args as Record<string, unknown>,
      supabase,
      tenantId,
      userId,
      scope.campaignerId,
      agent.id,
      scope.role,
      scope.managedAgencyIds,
      null,
      null,
      "agent_direct",
      null,
    );

    return json({ result });
  } catch (e) {
    return json({
      result: { error: String((e as Error | null)?.message ?? e) },
    });
  }
}

export interface DirectToolBody extends Pick<RunBody, "tenant_id" | "user_id"> {
  direct_tool?: DirectToolRequest | null;
}

export interface DirectToolDependencies {
  executeTool: ToolExecutor;
}
