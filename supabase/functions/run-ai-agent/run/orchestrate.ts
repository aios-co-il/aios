import type { RunInputs, RunDependencies } from "./contracts.ts";
import { RunState } from "./state.ts";
import { runAgent } from "./agent.ts";
import { runErrorResponse } from "./error-response.ts";

/** Runs the named stages under the same outer failure boundary as the legacy handler. */
export async function runOrchestratedAgent(
  input: RunInputs,
  dependencies: RunDependencies,
): Promise<Response> {
  try {
    const result = await runAgent(new RunState(input, dependencies));

    // Manus finishes with confirmation text; both HTTP and SSE callers consume JSON.
    return typeof result === "string"
      ? new Response(JSON.stringify({ success: true, output: result }), {
          headers: {
            ...dependencies.corsHeaders,
            "Content-Type": "application/json",
          },
        })
      : result;
  } catch (error) {
    return await runErrorResponse(input, dependencies, error);
  }
}
