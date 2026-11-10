import type { DelegateToGithubAgentArgs } from "./delegation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing delegate_to_github_agent executor and side-effect order. */
export async function executeDelegateToGithubAgent(
  args: DelegateToGithubAgentArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/github-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: args.action || "chat_support",
      tenant_id: tenantId,
      message: args.message,
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    return { error: `github-agent failed [${res.status}]: ${txt}` };
  }
  try {
    return JSON.parse(txt);
  } catch {
    return { response: txt };
  }
}
