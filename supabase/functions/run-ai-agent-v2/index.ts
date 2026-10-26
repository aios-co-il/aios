// run-ai-agent-v2 — explicit ReAct loop with persisted runs, approval gate, reflection.
// New runs: { agent_id, goal, context?, tenant_id, max_steps? }
// Resume: { run_id, tenant_id }  (called by resume-agent-run after approval)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { resolveModelId } from "../_shared/models.ts";
import { requireAuth } from "../_shared/security.ts";
import { internalBrainDenied } from "../_shared/carmen/brain-guard.ts";
import type { Database, Json, Tables } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asJsonObject, isJsonObject } from "../_shared/agent-task-result.ts";
import { errorMessage as thrownMessage } from "../_shared/error-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const AI_GATEWAY_URL = "https://api.openai.com/v1/chat/completions";

type ToolRow = Pick<
  Tables<"agent_tools">,
  | "id"
  | "name"
  | "display_name"
  | "description"
  | "input_schema"
  | "handler_kind"
  | "handler_ref"
  | "requires_approval"
  | "enabled"
>;

type RunRow = Tables<"agent_runs">;

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: Json[] }
  | { role: "tool"; tool_call_id: Json | undefined; content: string };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logStep(
  supabase: DbClient,
  run: RunRow,
  stepIndex: number,
  stepKind:
    | "plan"
    | "tool"
    | "observation"
    | "reflection"
    | "final"
    | "approval_pending",
  details: {
    thought?: string;
    tool_name?: Json;
    tool_input?: Json;
    observation?: Json;
    status?: "success" | "error" | "pending";
    error_message?: string;
    tokens_in?: number;
    tokens_out?: number;
    duration_ms?: number;
  },
) {
  await supabase.from("agent_action_log").insert({
    tenant_id: run.tenant_id,
    agent_id: run.agent_id,
    run_id: run.id,
    step_index: stepIndex,
    step_kind: stepKind,
    action_type: stepKind,
    action_details: {
      tool_name: details.tool_name ?? null,
      tool_input: details.tool_input ?? null,
    },
    thought: details.thought ?? null,
    observation: details.observation ?? null,
    status: details.status ?? "success",
    error_message: details.error_message ?? null,
    tokens_in: details.tokens_in ?? null,
    tokens_out: details.tokens_out ?? null,
    duration_ms: details.duration_ms ?? null,
    model: run.model,
  });
}

async function loadTools(
  supabase: DbClient,
  tenantId: string,
): Promise<ToolRow[]> {
  const { data } = await supabase
    .from("agent_tools")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("enabled", true);
  return data ?? [];
}

function buildOpenAITools(tools: ToolRow[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? t.display_name ?? t.name,
      parameters: t.input_schema ?? { type: "object", properties: {} },
    },
  }));
}

// Reconstruct OpenAI-style messages from action log (for resume).
async function reconstructMessages(
  supabase: DbClient,
  run: RunRow,
  systemPrompt: string,
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: run.goal },
  ];
  const { data: log } = await supabase
    .from("agent_action_log")
    .select("step_index, step_kind, thought, action_details, observation")
    .eq("run_id", run.id)
    .order("step_index", { ascending: true });
  for (const row of log ?? []) {
    if (row.step_kind === "tool") {
      const actionDetails = asJsonObject(row.action_details);
      const toolName = actionDetails.tool_name;
      const toolInput = actionDetails.tool_input ?? {};
      const callId = `call_${row.step_index}`;
      messages.push({
        role: "assistant",
        content: row.thought || null,
        tool_calls: [
          {
            id: callId,
            type: "function",
            function: { name: toolName, arguments: JSON.stringify(toolInput) },
          },
        ],
      });
      if (row.observation != null) {
        messages.push({
          role: "tool",
          tool_call_id: callId,
          content:
            typeof row.observation === "string"
              ? row.observation
              : JSON.stringify(row.observation),
        });
      }
    }
  }
  return messages;
}

async function callLLM(
  model: string,
  messages: ChatMessage[],
  openaiTools: ReturnType<typeof buildOpenAITools>,
) {
  const t0 = Date.now();
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: openaiTools.length ? openaiTools : undefined,
      tool_choice: openaiTools.length ? "auto" : undefined,
    }),
  });
  const duration_ms = Date.now() - t0;
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM ${resp.status}: ${text}`);
  }
  const data: Json = await resp.json();
  const { choices, usage } = asJsonObject(data);
  const choice = Array.isArray(choices) ? choices[0] : undefined;
  return {
    message: asJsonObject(asJsonObject(choice).message),
    usage: asJsonObject(usage),
    duration_ms,
  };
}

async function executeTool(
  supabase: DbClient,
  tool: ToolRow,
  input: Json,
  run: RunRow,
): Promise<Json> {
  if (tool.handler_kind === "edge" && tool.handler_ref) {
    const { data, error } = await supabase.functions.invoke(tool.handler_ref, {
      body: {
        ...asJsonObject(input),
        _run_id: run.id,
        _tenant_id: run.tenant_id,
        _agent_id: run.agent_id,
      },
    });
    if (error) throw error;
    return data ?? { ok: true };
  }
  if (tool.handler_kind === "mcp" && tool.handler_ref) {
    const [connId, toolName] = tool.handler_ref.split("::");
    const { data: conn } = await supabase
      .from("agent_mcp_connections")
      .select("*")
      .eq("id", connId)
      .single();
    if (!conn) return { ok: false, error: "mcp connection missing" };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const bearer = asJsonObject(conn.oauth_tokens).bearer;
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    const resp = await fetch(conn.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: input },
      }),
    });
    const text = await resp.text();
    if (!resp.ok)
      return { ok: false, error: `MCP ${resp.status}: ${text.slice(0, 300)}` };
    try {
      const ct = resp.headers.get("content-type") ?? "";
      let parsed: Json;
      if (ct.includes("text/event-stream")) {
        const m = text.match(/data:\s*(\{[^\n]+\})/);
        parsed = m ? JSON.parse(m[1]) : { result: text };
      } else parsed = JSON.parse(text);
      if (parsed === null) return { ok: true, raw: text.slice(0, 500) };
      return (isJsonObject(parsed) ? parsed.result : undefined) ?? parsed;
    } catch {
      return { ok: true, raw: text.slice(0, 500) };
    }
  }
  if (tool.handler_kind === "internal") {
    return {
      ok: true,
      note: `internal tool ${tool.name} — no executor configured`,
    };
  }
  return { ok: false, error: `Unsupported handler_kind: ${tool.handler_kind}` };
}

async function finalizeRun(
  supabase: DbClient,
  run: RunRow,
  finalAnswer: string,
  status: "completed" | "failed",
  errorMessage?: string,
) {
  // Reflection: ask the model to summarize and write episodic memory.
  try {
    if (status === "completed") {
      const reflectResp = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: run.model ?? "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "סכם בקצרה (עד 3 משפטים) מה הסוכן השיג והאם יש לקח שכדאי לזכור לעתיד. ענה בעברית.",
            },
            {
              role: "user",
              content: `מטרה: ${run.goal}\nתשובה סופית: ${finalAnswer}`,
            },
          ],
        }),
      });
      if (reflectResp.ok) {
        const rdata = await reflectResp.json();
        const reflection = rdata.choices?.[0]?.message?.content ?? "";
        if (reflection) {
          await supabase.from("agent_memory").insert({
            tenant_id: run.tenant_id,
            agent_id: run.agent_id,
            category: "run_reflection",
            memory_type: "episodic",
            title: run.goal.slice(0, 120),
            summary: reflection,
            importance: 60,
            metadata: { run_id: run.id },
          });
          await logStep(supabase, run, run.current_step + 1, "reflection", {
            thought: reflection,
            status: "success",
          });
        }
      }
    }
  } catch (e) {
    console.error("[reflection] failed:", thrownMessage(e));
  }

  await supabase
    .from("agent_runs")
    .update({
      status,
      final_answer: finalAnswer,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabase = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    let run: RunRow;
    let isResume = false;

    if (body.run_id) {
      // ==== RESUME ====
      isResume = true;
      const { data, error } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("id", body.run_id)
        .single();
      if (error || !data) throw new Error("run not found");
      run = data;
      if (
        run.status === "completed" ||
        run.status === "failed" ||
        run.status === "cancelled"
      ) {
        return jsonResponse({ ok: true, run, note: "run already finished" });
      }
      await supabase
        .from("agent_runs")
        .update({ status: "running", pending_approval_id: null })
        .eq("id", run.id);
      run.status = "running";
    } else {
      // ==== NEW ====
      if (!body.agent_id || !body.goal || !body.tenant_id) {
        return jsonResponse({ error: "missing agent_id/goal/tenant_id" }, 400);
      }
      // Per-user Carmen permissions for a signed-in caller starting a run.
      const denied = await internalBrainDenied(
        supabase,
        await requireAuth(req),
        {
          tenantId: body.tenant_id,
          agentId: body.agent_id,
        },
      );
      if (denied) return denied;
      const { data, error } = await supabase
        .from("agent_runs")
        .insert({
          tenant_id: body.tenant_id,
          agent_id: body.agent_id,
          user_id: body.user_id ?? null,
          goal: body.goal,
          context: body.context ?? {},
          status: "running",
          max_steps: body.max_steps ?? 12,
          conversation_id: body.conversation_id ?? null,
          trigger_source: body.trigger_source ?? "manual",
          parent_run_id: body.parent_run_id ?? null,
          replay_of_run_id: body.replay_of_run_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      run = data;
    }

    // Load agent + tools
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("id", run.agent_id)
      .single();
    if (!agent) throw new Error("agent not found");

    const model = resolveModelId(agent.engine ?? "gemini-3-flash");
    if (!run.model) {
      await supabase.from("agent_runs").update({ model }).eq("id", run.id);
      run.model = model;
    }

    const tools = await loadTools(supabase, run.tenant_id);

    // Load MCP connections (ready) — expose their tools with mcp__<connId>__<toolName> prefix
    const { data: mcpConns } = await supabase
      .from("agent_mcp_connections")
      .select("*")
      .eq("tenant_id", run.tenant_id)
      .eq("state", "ready")
      .or(`agent_id.eq.${run.agent_id},agent_id.is.null`);
    const mcpTools: ToolRow[] = [];
    for (const c of mcpConns ?? []) {
      const list = Array.isArray(c.available_tools) ? c.available_tools : [];
      for (const listed of list) {
        const t = asJsonObject(listed);
        mcpTools.push({
          id: `mcp_${c.id}_${t.name}`,
          name: `mcp__${c.id.replace(/-/g, "")}__${t.name}`.slice(0, 64),
          display_name: `${c.name} • ${t.name}`,
          description:
            typeof t.description === "string"
              ? t.description
              : `MCP tool from ${c.name}`,
          input_schema: t.inputSchema ?? { type: "object", properties: {} },
          handler_kind: "mcp",
          handler_ref: `${c.id}::${t.name}`,
          requires_approval: false,
          enabled: true,
        });
      }
    }
    const allTools = [...tools, ...mcpTools];
    const toolsByName = new Map(allTools.map((t) => [t.name, t]));
    const openaiTools = buildOpenAITools(allTools);

    const systemPrompt =
      (agent.system_prompt as string | null) ??
      "אתה סוכן AI אוטונומי. עבוד בלולאת ReAct: חשוב על הצעד הבא, השתמש בכלים זמינים, צפה בתוצאות, והמשך עד שתשיג את המטרה. ענה בקצרה ובעברית.";

    const messages: ChatMessage[] = isResume
      ? await reconstructMessages(supabase, run, systemPrompt)
      : [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `מטרה: ${run.goal}${run.context && Object.keys(run.context).length ? `\nקונטקסט: ${JSON.stringify(run.context)}` : ""}`,
          },
        ];

    let step = run.current_step;
    let totalIn = run.total_tokens_in;
    let totalOut = run.total_tokens_out;

    // Run loop
    while (step < run.max_steps) {
      step++;
      const { message, usage, duration_ms } = await callLLM(
        model,
        messages,
        openaiTools,
      );
      const content =
        typeof message.content === "string" ? message.content : null;
      const tokens_in =
        typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
      const tokens_out =
        typeof usage.completion_tokens === "number"
          ? usage.completion_tokens
          : 0;
      totalIn += tokens_in;
      totalOut += tokens_out;

      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls
        : [];

      if (!toolCalls.length) {
        // Final answer
        const finalAnswer = content ?? "";
        await logStep(supabase, run, step, "final", {
          thought: finalAnswer,
          tokens_in,
          tokens_out,
          duration_ms,
          status: "success",
        });
        await supabase
          .from("agent_runs")
          .update({
            current_step: step,
            total_tokens_in: totalIn,
            total_tokens_out: totalOut,
          })
          .eq("id", run.id);

        await finalizeRun(supabase, run, finalAnswer, "completed");
        return jsonResponse({
          ok: true,
          run_id: run.id,
          status: "completed",
          final_answer: finalAnswer,
        });
      }

      // Handle first tool call (sequential — simpler & checkpoint-friendly)
      const call = asJsonObject(toolCalls[0]);
      const callFunction = asJsonObject(call.function);
      const toolName = callFunction.name;
      let toolInput: Json = {};
      try {
        toolInput = JSON.parse(
          typeof callFunction.arguments === "string" && callFunction.arguments
            ? callFunction.arguments
            : "{}",
        );
      } catch {
        // Keep the empty tool-input default when arguments are not valid JSON.
      }
      const tool =
        typeof toolName === "string" ? toolsByName.get(toolName) : undefined;

      // Append assistant message + tool call to messages
      messages.push({
        role: "assistant",
        content,
        tool_calls: toolCalls,
      });

      if (!tool) {
        const obs = { ok: false, error: `Unknown tool: ${toolName}` };
        await logStep(supabase, run, step, "tool", {
          thought: content ?? undefined,
          tool_name: toolName,
          tool_input: toolInput,
          observation: obs,
          status: "error",
          tokens_in,
          tokens_out,
          duration_ms,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(obs),
        });
        continue;
      }

      // Approval gate
      if (tool.requires_approval) {
        const { data: approval } = await supabase
          .from("agent_approval_queue")
          .insert({
            tenant_id: run.tenant_id,
            agent_id: run.agent_id,
            run_id: run.id,
            action_type: "tool_call",
            title: `אישור לפעולה: ${tool.display_name ?? tool.name}`,
            description: tool.description,
            tool_name: tool.name,
            tool_input: toolInput,
            status: "pending",
          })
          .select()
          .single();

        await logStep(supabase, run, step, "approval_pending", {
          thought: content ?? undefined,
          tool_name: toolName,
          tool_input: toolInput,
          observation: { approval_id: approval?.id },
          status: "pending",
          tokens_in,
          tokens_out,
          duration_ms,
        });

        await supabase
          .from("agent_runs")
          .update({
            status: "waiting_approval",
            current_step: step,
            pending_approval_id: approval?.id ?? null,
            total_tokens_in: totalIn,
            total_tokens_out: totalOut,
          })
          .eq("id", run.id);

        return jsonResponse({
          ok: true,
          run_id: run.id,
          status: "waiting_approval",
          approval_id: approval?.id,
          tool_name: toolName,
        });
      }

      // Execute tool
      let observation: Json;
      let status: "success" | "error" = "success";
      try {
        observation = await executeTool(supabase, tool, toolInput, run);
      } catch (e) {
        observation = { ok: false, error: String(thrownMessage(e) ?? e) };
        status = "error";
      }

      await logStep(supabase, run, step, "tool", {
        thought: content ?? undefined,
        tool_name: toolName,
        tool_input: toolInput,
        observation,
        status,
        tokens_in,
        tokens_out,
        duration_ms,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(observation),
      });

      await supabase
        .from("agent_runs")
        .update({
          current_step: step,
          total_tokens_in: totalIn,
          total_tokens_out: totalOut,
        })
        .eq("id", run.id);
    }

    // Max steps reached
    await finalizeRun(
      supabase,
      run,
      "הגעתי למספר הצעדים המקסימלי ללא תשובה סופית.",
      "failed",
      "max_steps_reached",
    );
    return jsonResponse({
      ok: false,
      run_id: run.id,
      status: "failed",
      error: "max_steps_reached",
    });
  } catch (e) {
    console.error("[run-ai-agent-v2] error:", thrownMessage(e));
    return jsonResponse({ error: String(thrownMessage(e) ?? e) }, 500);
  }
});
