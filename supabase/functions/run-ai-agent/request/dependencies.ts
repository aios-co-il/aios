import { requireAuth } from "../../_shared/security.ts";
import { handleDirectTool } from "../direct-tools/handle.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { runTenantDenied } from "../run-tenant-access.ts";
import { resolveWorkshopAwareEngine } from "../../_shared/carmen/brain-engine/workshop-brain.ts";
import { internalBrainDenied } from "../../_shared/carmen/brain-guard.ts";
import { openRouterTail } from "../../_shared/carmen/brain-engine/openrouter-tail.ts";
import { handleRunAgent } from "../run/handle.ts";
import { createAgentStream } from "./stream.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";

export interface RequestDependencies {
  requireAuth: typeof requireAuth;
  handleDirectTool: typeof handleDirectTool;
  createClient(url: string, key: string): AgentDatabaseClient;
  runTenantDenied: typeof runTenantDenied;
  resolveWorkshopAwareEngine: typeof resolveWorkshopAwareEngine;
  internalBrainDenied: typeof internalBrainDenied;
  openRouterTail: typeof openRouterTail;
  handleRunAgent: typeof handleRunAgent;
  createAgentStream: typeof createAgentStream;
}

/** Production uses the same function implementations as the original HTTP callback. */
export const REQUEST_DEPENDENCIES: RequestDependencies = {
  requireAuth,
  handleDirectTool,
  createClient,
  runTenantDenied,
  resolveWorkshopAwareEngine,
  internalBrainDenied,
  openRouterTail,
  handleRunAgent,
  createAgentStream,
};
