import type { executeTool } from "../tool-execution/execute.ts";
import type { tryFastLane } from "../fast-lane/run.ts";
import type { saveConversationTurn } from "./save-conversation-turn.ts";

import type { corsHeaders } from "../runtime.ts";
import type { CORE_TOOLS } from "./core-tools.ts";

import type { AgentDatabaseClient } from "../database-contracts.ts";

export type RunDependencies = {
  executeTool: typeof executeTool;
  tryFastLane: typeof tryFastLane;
  saveConversationTurn: typeof saveConversationTurn;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  corsHeaders: typeof corsHeaders;
  CORE_TOOLS: typeof CORE_TOOLS;
  createClient: (url: string, key: string) => AgentDatabaseClient;
};
