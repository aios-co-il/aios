import type { RunInputs, RunDependencies } from "./contracts.ts";
import { RunState } from "./state.ts";
import { runAgent } from "./agent.ts";
import { runErrorResponse } from "./error-response.ts";

/** Runs the named stages under the same outer failure boundary as the legacy handler. */
export async function runOrchestratedAgent(
  input: RunInputs,
  dependencies: RunDependencies,
): Promise<Response | string> {
  try {
    return await runAgent(new RunState(input, dependencies));
  } catch (error) {
    return await runErrorResponse(input, dependencies, error);
  }
}
