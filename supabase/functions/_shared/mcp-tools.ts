// MCP tools loader for run-ai-agent.
// Loads ready MCP connections (tenant + optional agent scope) and exposes
// AI-Gateway compatible tool definitions plus per-tool executors that call
// the remote MCP server via JSON-RPC over HTTP.

import {
  isMcpAuthError,
  isMcpTimeoutError,
  mcpJsonRpc,
  resyncInternalMcpBearer,
} from "./mcp-bearer.ts";

/** Coding-agent dispatch tools that often outlive a short HTTP wait. */
function isCodingAgentDispatchTool(remoteName: string): boolean {
  const n = String(remoteName || "").toLowerCase();
  return (
    n === "request_dev_task" ||
    n === "ask_cursor" ||
    n === "ask_claude" ||
    n === "ask_grok" ||
    n === "ask_manus"
  );
}

/** Soft result so Carmen does not tell David "Cursor didn't receive" on client abort. */
export function codingAgentDispatchTimeoutResult(
  connName: string,
  remoteName: string,
): Record<string, unknown> {
  return {
    ok: false,
    timeout: true,
    delivery_unconfirmed: true,
    // Explicit machine-readable flag for prompts / future reconcile.
    do_not_claim_not_received: true,
    message:
      `MCP ${connName}/${remoteName} timed out waiting for the tool reply. ` +
      `The coding agent may still have received the request and opened a bc- session. ` +
      `Do NOT tell David that Cursor/Claude/Grok "didn't receive" the request. ` +
      `Say delivery could not be confirmed yet; check list_dev_tasks / recent sessions, ` +
      `or use attach_dev_task_session if a bc- URL appears.`,
  };
}

export interface McpLoaded {
  toolDefs: Array<{ name: string; description?: string; parameters: any }>;
  executors: Map<string, (args: any) => Promise<any>>;
  connectionsCount: number;
}

interface McpConnRow {
  id: string;
  name: string;
  url: string;
  state: string;
  oauth_tokens: any;
  available_tools: any;
  updated_at?: string | null;
}

// A connection's tool list rarely changes; reusing the stored list for a few minutes saves a
// live tools/list round trip per connection on every Carmen message (AIO-509).
export const MCP_TOOLS_FRESH_MS = 10 * 60 * 1000;

/** Whether the stored tool list is recent enough to use without asking the server again. */
export function storedToolsAreFresh(
  conn: Pick<McpConnRow, "available_tools" | "updated_at">,
  now: number = Date.now(),
): boolean {
  if (
    !Array.isArray(conn.available_tools) ||
    conn.available_tools.length === 0
  ) {
    return false;
  }
  const updated = conn.updated_at ? Date.parse(conn.updated_at) : NaN;
  return Number.isFinite(updated) && now - updated < MCP_TOOLS_FRESH_MS;
}

function sanitizeToolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
}

async function callMcpWithResync(
  supabase: any,
  conn: McpConnRow,
  tenantId: string,
  method: string,
  params: any = {},
  id = 1,
): Promise<{ resp: any; bearer: string | undefined }> {
  let bearer = conn.oauth_tokens?.bearer as string | undefined;
  try {
    return {
      resp: await mcpJsonRpc(conn.url, bearer, method, params, id),
      bearer,
    };
  } catch (e) {
    if (!isMcpAuthError(e)) throw e;
    console.warn(
      `[mcp-tools] ${method} auth failed for ${conn.name}, resyncing bearer from edge secret`,
    );
    const resynced = await resyncInternalMcpBearer(supabase, {
      id: conn.id,
      name: conn.name,
      url: conn.url,
      tenant_id: tenantId,
    });
    if (!resynced?.bearer) throw e;
    bearer = resynced.bearer;
    conn.oauth_tokens = { bearer };
    conn.available_tools = resynced.tools;
    conn.state = resynced.state;
    return {
      resp: await mcpJsonRpc(conn.url, bearer, method, params, id),
      bearer,
    };
  }
}

/**
 * A connection's tools: the stored list while it is fresh, else a live tools/list (stored
 * list as the fallback). `live` says whether the server answered, so only a real answer
 * refreshes the stored copy and its timestamp.
 */
async function toolsForConnection(
  supabase: any,
  tenantId: string,
  conn: McpConnRow,
): Promise<{ tools: any[]; live: boolean }> {
  const cached = Array.isArray(conn.available_tools)
    ? conn.available_tools
    : [];
  if (storedToolsAreFresh(conn)) {
    return { tools: cached, live: false };
  }
  try {
    const { resp } = await callMcpWithResync(
      supabase,
      conn,
      tenantId,
      "tools/list",
    );
    const live = resp?.result?.tools;
    if (Array.isArray(live) && live.length > 0) {
      return { tools: live, live: true };
    }
  } catch (e) {
    console.warn(
      `[mcp-tools] tools/list failed for ${conn.name}:`,
      (e as any)?.message ?? e,
    );
  }
  return { tools: cached, live: false };
}

export async function loadMcpTools(
  supabase: any,
  tenantId: string,
  agentId?: string | null,
  disabledIntegrations: string[] = [],
): Promise<McpLoaded> {
  const empty: McpLoaded = {
    toolDefs: [],
    executors: new Map(),
    connectionsCount: 0,
  };
  if (!tenantId) return empty;
  const disabledSet = new Set(
    (disabledIntegrations || []).map((s) => String(s)),
  );

  let q = supabase
    .from("agent_mcp_connections")
    .select("id, name, url, state, oauth_tokens, available_tools, updated_at")
    .eq("tenant_id", tenantId)
    .eq("state", "ready");
  // Include tenant-wide (agent_id null) + this agent's
  if (agentId) {
    q = q.or(`agent_id.eq.${agentId},agent_id.is.null`);
  } else {
    q = q.is("agent_id", null);
  }
  const { data, error } = await q;
  if (error || !data?.length) return empty;

  const toolDefs: McpLoaded["toolDefs"] = [];
  const executors = new Map<string, (args: any) => Promise<any>>();

  // Access control: skip integrations turned OFF for this agent.
  const connections = (data as McpConnRow[]).filter(
    (conn) => !disabledSet.has(conn.name),
  );
  // Every connection's tool list at once, not one round trip after another.
  const toolLists = await Promise.all(
    connections.map((conn) => toolsForConnection(supabase, tenantId, conn)),
  );

  for (const [index, conn] of connections.entries()) {
    const { tools, live } = toolLists[index];
    const bearer = conn.oauth_tokens?.bearer as string | undefined;
    const connSlug = sanitizeToolName(conn.name || conn.id.slice(0, 6));

    // A live answer refreshes the stored list and its timestamp, changed or not.
    if (live) {
      try {
        await supabase
          .from("agent_mcp_connections")
          .update({
            available_tools: tools,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conn.id)
          .eq("tenant_id", tenantId);
      } catch (e) {
        console.warn(
          "[mcp-tools] cache refresh failed:",
          (e as any)?.message ?? e,
        );
      }
    }

    for (const t of tools) {
      if (!t?.name) continue;
      const prefixed = sanitizeToolName(`mcp_${connSlug}__${t.name}`);
      if (executors.has(prefixed)) continue;
      toolDefs.push({
        name: prefixed,
        description: `[MCP:${conn.name}] ${t.description || t.name}`.slice(
          0,
          1000,
        ),
        parameters: t.inputSchema ||
          t.input_schema || { type: "object", properties: {} },
      });
      const remoteName = t.name as string;
      executors.set(prefixed, async (args: any) => {
        try {
          const { resp } = await callMcpWithResync(
            supabase,
            conn,
            tenantId,
            "tools/call",
            {
              name: remoteName,
              arguments: args ?? {},
            },
          );
          if (resp?.error) {
            throw new Error(
              `MCP ${conn.name}/${remoteName}: ${resp.error.message || JSON.stringify(resp.error)}`,
            );
          }
          const content = resp?.result?.content;
          // Flatten common content shapes to plain text/json for the model.
          if (Array.isArray(content)) {
            const parts = content
              .map((c: any) => c?.text ?? c?.data ?? c)
              .filter(Boolean);
            return parts.length === 1 ? parts[0] : parts;
          }
          return resp?.result ?? resp;
        } catch (e) {
          if (isMcpTimeoutError(e) && isCodingAgentDispatchTool(remoteName)) {
            console.warn(
              `[mcp-tools] ${conn.name}/${remoteName} timed out — returning soft delivery_unconfirmed (agent may still be running)`,
            );
            return codingAgentDispatchTimeoutResult(conn.name, remoteName);
          }
          throw e;
        }
      });
    }
  }

  return { toolDefs, executors, connectionsCount: data.length };
}
