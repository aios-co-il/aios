import type { RunInputs, RunDependencies } from "./contracts.ts";

/** Records a failed run without masking the original error response. */
export async function runErrorResponse(
  input: RunInputs,
  dependencies: RunDependencies,
  error: unknown,
): Promise<Response> {
  console.error("run-ai-agent error:", error);
  // Persist the failure so it's diagnosable from the DB (console logs are ephemeral
  // and invisible to monitoring). Fire-and-forget — never mask the original error.
  try {
    const sb = dependencies.createClient(
      dependencies.SUPABASE_URL,
      dependencies.SUPABASE_SERVICE_ROLE_KEY,
    );
    await sb.from("error_logs").insert({
      source: "run-ai-agent",
      tenant_id: input.bodyJson?.tenant_id || null,
      error_message: String((error as Error | null)?.message || error).slice(
        0,
        2000,
      ),
      error_stack:
        String((error as Error | null)?.stack || "").slice(0, 4000) || null,
      context: {
        surface: input.surface,
        agent_id: input.bodyJson?.agent_id || null,
        command_preview: String(input.bodyJson?.command_text || "").slice(
          0,
          120,
        ),
      },
    });
  } catch (logErr) {
    console.error("run-ai-agent error_logs insert failed:", logErr);
  }
  return new Response(
    JSON.stringify({ success: false, error: (error as Error).message }),
    {
      headers: {
        ...dependencies.corsHeaders,
        "Content-Type": "application/json",
      },
      status: 400,
    },
  );
}
