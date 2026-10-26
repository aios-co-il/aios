// run-agent-eval — runs an eval dataset against an agent and scores results via LLM judge.
// Body: { eval_id, tenant_id, user_id? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { errorMessage } from "../_shared/error-message.ts";
import { resolveModelId } from "../_shared/models.ts";
import type { Json } from "../_shared/database.types.ts";

type EvalCaseResult = {
  input: Json;
  expected: Json;
  actual: Json;
  score: number;
  reasoning: string;
  passed: boolean;
  run_id?: string;
};

/** A dataset case's input/expected value; "" when missing or the case is not an object. */
function caseField(testCase: Json, key: "input" | "expected"): Json {
  if (
    typeof testCase !== "object" ||
    testCase === null ||
    Array.isArray(testCase)
  ) {
    return "";
  }
  return testCase[key] ?? "";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const AI_GATEWAY_URL = "https://api.openai.com/v1/chat/completions";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function judge(
  input: Json,
  expected: Json,
  actual: Json,
): Promise<{ score: number; reasoning: string }> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolveModelId("gemini-2.5-pro"),
      messages: [
        {
          role: "system",
          content:
            'אתה שופט מומחה. השווה תשובה של AI מול תשובה צפויה והחזר JSON: {"score": 0-100, "reasoning":"..."}. ענה ב-JSON בלבד.',
        },
        {
          role: "user",
          content: `קלט: ${input}\n\nצפוי: ${expected}\n\nבפועל: ${actual}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) return { score: 0, reasoning: `judge failed: ${resp.status}` };
  const data = await resp.json();
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    return {
      score: Number(parsed.score) || 0,
      reasoning: String(parsed.reasoning ?? ""),
    };
  } catch {
    return { score: 0, reasoning: "judge json parse failed" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const { eval_id, tenant_id, user_id } = await req.json();
    if (!eval_id || !tenant_id)
      return jsonResponse({ error: "missing eval_id/tenant_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: evalRow } = await supabase
      .from("agent_evals")
      .select("*")
      .eq("id", eval_id)
      .single();
    if (!evalRow) return jsonResponse({ error: "eval not found" }, 404);

    const dataset: Json[] = Array.isArray(evalRow.dataset)
      ? evalRow.dataset
      : [];
    const threshold = evalRow.pass_threshold ?? 70;

    const { data: evalRun } = await supabase
      .from("agent_eval_runs")
      .insert({
        tenant_id,
        eval_id,
        agent_id: evalRow.agent_id,
        status: "running",
        total_cases: dataset.length,
      })
      .select()
      .single();

    const results: EvalCaseResult[] = [];
    let totalScore = 0;
    let passed = 0;

    for (const tc of dataset) {
      const input = caseField(tc, "input");
      const expected = caseField(tc, "expected");
      try {
        const { data: invokeData } = await supabase.functions.invoke(
          "run-ai-agent-v2",
          {
            body: {
              agent_id: evalRow.agent_id,
              goal: input,
              tenant_id,
              user_id: user_id ?? null,
              trigger_source: "eval",
              max_steps: 6,
            },
          },
        );
        const actual = invokeData?.final_answer ?? "";
        const { score, reasoning } = await judge(input, expected, actual);
        const pass = score >= threshold;
        if (pass) passed++;
        totalScore += score;
        results.push({
          input,
          expected,
          actual,
          score,
          reasoning,
          passed: pass,
          run_id: invokeData?.run_id,
        });
      } catch (e) {
        results.push({
          input,
          expected,
          actual: null,
          score: 0,
          reasoning: String(errorMessage(e) ?? e),
          passed: false,
        });
      }
    }

    const avg = dataset.length ? totalScore / dataset.length : 0;
    await supabase
      .from("agent_eval_runs")
      .update({
        status: "completed",
        passed_cases: passed,
        avg_score: avg.toFixed(2),
        results,
        completed_at: new Date().toISOString(),
      })
      .eq("id", evalRun!.id);

    return jsonResponse({
      ok: true,
      eval_run_id: evalRun!.id,
      passed,
      total: dataset.length,
      avg_score: avg,
    });
  } catch (e) {
    console.error("[run-agent-eval]", errorMessage(e));
    return jsonResponse({ error: String(errorMessage(e) ?? e) }, 500);
  }
});
