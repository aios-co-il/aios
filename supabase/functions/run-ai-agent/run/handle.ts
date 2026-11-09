import type { RunBody } from "./contracts.ts";
import type { Surface } from "../surface.ts";
import type { Emit } from "./emit.ts";
import type { BrainEngine } from "../../_shared/carmen/brain-engine/load.ts";
import type { BrainEngineTarget } from "../../_shared/carmen/brain-engine/load.ts";
import { runOrchestratedAgent } from "./orchestrate.ts";
import { executeTool } from "../tool-execution/execute.ts";
import { tryFastLane } from "../fast-lane/run.ts";
import { saveConversationTurn } from "./save-conversation-turn.ts";
import { SUPABASE_URL } from "../runtime.ts";
import { SUPABASE_SERVICE_ROLE_KEY } from "../runtime.ts";
import { corsHeaders } from "../runtime.ts";
import { CORE_TOOLS } from "./core-tools.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

/** Composes staged execution with the same production tool, fast-lane and persistence dependencies. */
export async function handleRunAgent(
  bodyJson: RunBody,
  surface: Surface,
  emit: Emit,
  brainEngine?: Extract<BrainEngine, { kind: "connections" }>,
  request: {
    /** How the request was authenticated (requireAuth): a signed-in user, or a service call. */
    authKind?: string;
    /** The browser's Origin header, for full links back to the app the chat runs on. */
    origin?: string | null;
  } = {},
  /** The tenant's OpenRouter brain, the last link of Carmen's own engine when allowed. */
  internalTail?: () => Promise<Array<BrainEngineTarget>>,
): Promise<Response> {
  return (await runOrchestratedAgent(
    { bodyJson, surface, emit, brainEngine, request, internalTail },
    {
      executeTool,
      tryFastLane,
      saveConversationTurn,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      corsHeaders,
      CORE_TOOLS,
      createClient,
    },
  )) as Response;
}
