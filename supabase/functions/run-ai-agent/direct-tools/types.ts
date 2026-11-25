import type { RunBody } from "../run/contracts.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { ToolExecutor } from "../tool-execution/route.ts";

export interface DirectToolRequest {
  action?: string;
  caller?: unknown;
  approval_id?: string;
  approved_by?: unknown;
  name?: unknown;
  args?: unknown;
}

export interface DirectToolBody extends Pick<RunBody, "tenant_id" | "user_id"> {
  direct_tool?: DirectToolRequest | null;
}

export interface DirectToolDependencies {
  createClient(url: string, key: string): DbClient;
  executeTool: ToolExecutor;
}
