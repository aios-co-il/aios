import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type DelegateToGithubAgentArgs = {
  message: string;
  action?: "chat_support" | "analyze_error" | "fix_code" | "check_permissions";
};

/** Preserves the existing delegate_to_github_agent executor and side-effect order. */
export async function executeDelegateToGithubAgent(
  args: DelegateToGithubAgentArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, supabase } = context;

  const res = await invokeExecutorFunction(
    supabase,
    "github-agent",
    {
      action: args.action || "chat_support",
      tenant_id: tenantId,
      message: args.message,
    },
    "text",
  );
  const txt =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  if (!res.ok) {
    return { error: `github-agent failed [${res.status}]: ${txt}` };
  }
  try {
    return JSON.parse(txt);
  } catch (error) {
    console.warn("[github-agent] non-JSON response", error);
    return { response: txt };
  }
}
