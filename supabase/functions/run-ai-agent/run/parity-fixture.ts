import { fixedDate } from "./parity-clock.ts";
import { clearSkillsCache } from "../../_shared/skills/registry.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import { stub } from "jsr:@std/testing@1/mock";
import { runOrchestratedAgent } from "./orchestrate.ts";
import { CORE_TOOLS } from "./core-tools.ts";
import type { RunBody, RunDependencies } from "./contracts.ts";

export type CapturedRequest = { url: string; method: string; body: unknown };
export interface FixtureOptions {
  promptVersion?: "v1" | "v2";
  body?: Partial<RunBody>;
  maxRounds?: number;
  settings?: Record<string, string>;
  modelResponses?: Array<{ status?: number; body: unknown }>;
  emit?: (event: unknown) => void;
}

/** Intercepts every database/model request while exercising the complete staged run. */
export async function runFixture(options: FixtureOptions = {}) {
  clearSkillsCache();
  const calls: Array<CapturedRequest> = [];
  const executed: Array<{ name: string; args: unknown }> = [];
  const responses = [...(options.modelResponses || [])];
  const oldUrl = Deno.env.get("SUPABASE_URL");
  const oldKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  const date = fixedDate();
  const network = stub(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    const text = await request.text();
    calls.push({
      url: request.url,
      method: request.method,
      body: text ? JSON.parse(text) : null,
    });
    const url = new URL(request.url);
    let data: unknown = [];
    let status = 200;
    if (url.pathname.endsWith("/ai_agents")) {
      data = {
        id: "agent",
        name: "Carmen",
        tenant_id: "t1",
        engine: "google/gemini-3-flash-preview",
        max_tool_rounds: options.maxRounds ?? 1,
        system_prompt: null,
        metadata: {
          prompt_version: options.promptVersion ?? "v1",
          token_optimize: false,
        },
        prompt_version: options.promptVersion ?? "v1",
        active_modes: [],
        active_skills: [],
        allowed_tools: [],
        disabled_tools: [],
        disabled_skins: [],
        token_optimize: false,
      };
    }
    if (url.pathname.endsWith("/tenants")) {
      data = { name: "Test tenant", type: "agency" };
    }
    if (
      url.pathname.endsWith("/tenant_integrations") &&
      url.searchParams.get("integration_type") === "eq.llm"
    ) {
      data = {
        settings: options.settings ?? { google_api_key: "fake-google" },
      };
    }
    if (url.pathname.endsWith("/chat/completions")) {
      const response = responses.shift();
      status = response?.status ?? 200;
      data = response?.body ?? {
        choices: [{ message: { role: "assistant", content: "Test response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "content-range": "0-0/0" },
    });
  });
  /** Replaces tool side effects while retaining the loop's authorization/approval checks. */
  async function executeTool(
    ...args: Parameters<RunDependencies["executeTool"]>
  ) {
    executed.push({ name: args[0], args: args[1] });
    return { count: 0, memories: [] };
  }
  /** No fast-lane answer for these full-run fixtures. */
  async function noFastReply() {
    return null;
  }
  /** Conversation persistence is asserted separately from these tenant-only fixtures. */
  async function noSave() {}
  try {
    const result = await runOrchestratedAgent(
      {
        bodyJson: {
          agent_id: "agent",
          tenant_id: "t1",
          command_text: "hello",
          pin_skills_only: true,
          task_skills: ["copywriter"],
          ...options.body,
        },
        surface: "internal_chat",
        request: {},
        emit: options.emit,
      },
      {
        createClient: (url, key) =>
          createClient<Database>(url, key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          }),
        executeTool,
        tryFastLane: noFastReply,
        saveConversationTurn: noSave,
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
        corsHeaders: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        },
        CORE_TOOLS,
      },
    );
    // Flush best-effort reporting that the run intentionally does not await.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { result, calls, executed };
  } finally {
    network.restore();
    date.restore();
    if (oldUrl === undefined) {
      Deno.env.delete("SUPABASE_URL");
    } else {
      Deno.env.set("SUPABASE_URL", oldUrl);
    }
    if (oldKey === undefined) {
      Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    } else {
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", oldKey);
    }
  }
}
