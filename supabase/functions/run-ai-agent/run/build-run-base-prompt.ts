import type { RunState } from "./state.ts";
import { shouldUseV2Prompt } from "../../_shared/carmen-prompt-v2.ts";
import { buildV1RunPrompt } from "./build-v1-run-prompt.ts";
import { buildV2RunPrompt } from "./build-v2-run-prompt.ts";
/** Selects the existing V1 or V2 prompt builder before skins and standing rules. */
export async function buildRunBasePrompt(run: RunState): Promise<void> {
  if (shouldUseV2Prompt(run.agent)) {
    await buildV2RunPrompt(run);
  } else {
    await buildV1RunPrompt(run);
  }
}
