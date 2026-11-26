/**
 * Who may start or resume a run in run-ai-agent-v2 (AIO-661), asked before the
 * handler touches a table.
 *
 * A signed-in user starts a run only as themselves, in a tenant they belong to
 * and with that tenant's agent: the same rule as run-ai-agent (runTenantDenied).
 * Resuming is for service callers only. A run stops to wait for an approver, and
 * resume-agent-run checks the approver's tenant and role and claims the approval
 * before it calls here, so a user resuming directly would skip that gate even
 * on their own run.
 *
 * Every run, whoever starts or resumes it, uses an agent of its own tenant:
 * the functions that call here with the service key take the agent from rows
 * a tenant wrote.
 */
import { bodyUuid } from "../_shared/agent-runs/body-id.ts";
import {
  AGENT_IN_OTHER_TENANT,
  type RunAuth,
  runTenantDenied,
} from "../_shared/agent-runs/run-tenant-access.ts";
import type { Tables } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The request may go on, or the refusal the handler sends back. */
export type RunRequestGate =
  { ok: true } | { ok: false; status: 401 | 403; error: string };

/**
 * Rows a new run points at. Only service callers name them (the supervisor's
 * parent run, a replay's source run); a user's would not be checked against
 * their tenant.
 */
const SERVICE_ONLY_RUN_LINKS = [
  "parent_run_id",
  "replay_of_run_id",
  "conversation_id",
] as const;

/**
 * Decides a start or resume request for the verified caller, reading nothing
 * for a caller it refuses outright. A user's body is bound to them in place:
 * their own user_id and no links to other rows.
 */
export async function authorizeRunRequest(
  sb: Pick<DbClient, "from" | "rpc">,
  auth: RunAuth | null,
  body: Record<string, unknown>,
): Promise<RunRequestGate> {
  if (!auth) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (auth.kind === "service") {
    return { ok: true };
  }
  if (body.run_id) {
    console.warn(`[run-ai-agent-v2] refused user ${auth.userId}: resume`);
    return {
      ok: false,
      status: 403,
      error: "Only an approved step resumes a run",
    };
  }

  const denied = await runTenantDenied(sb, auth, body);
  if (denied) {
    return { ok: false, status: 403, error: denied };
  }

  body.user_id = auth.userId;
  for (const link of SERVICE_ONLY_RUN_LINKS) {
    delete body[link];
  }
  return { ok: true };
}

/**
 * The run a service caller resumes, read inside the tenant the caller names;
 * null when that tenant has no such run.
 */
export async function resumableRun(
  sb: Pick<DbClient, "from">,
  body: Record<string, unknown>,
): Promise<Tables<"agent_runs"> | null> {
  const runId = bodyUuid(body.run_id);
  const tenantId = bodyUuid(body.tenant_id);
  if (!runId || !tenantId) {
    return null;
  }

  const { data, error } = await sb
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new Error(`agent_runs lookup failed: ${error.message}`);
  }
  return data;
}

/** The agent and run columns the tenant check compares. */
type RunAgentPair = {
  agent: Pick<Tables<"ai_agents">, "tenant_id">;
  run: Pick<Tables<"agent_runs">, "id" | "tenant_id" | "agent_id">;
};

/**
 * Closes a run whose agent belongs to another tenant and returns what the
 * caller is told; null when the agent is the run's tenant's.
 */
export async function foreignAgentRefusal(
  sb: Pick<DbClient, "from">,
  { agent, run }: RunAgentPair,
): Promise<string | null> {
  if (agent.tenant_id === run.tenant_id) {
    return null;
  }

  console.warn(
    `[run-ai-agent-v2] refused run ${run.id}: agent ${run.agent_id} is outside tenant ${run.tenant_id}`,
  );
  const { error } = await sb
    .from("agent_runs")
    .update({
      status: "failed",
      error_message: AGENT_IN_OTHER_TENANT,
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("tenant_id", run.tenant_id);
  if (error) {
    console.error(
      `[run-ai-agent-v2] run ${run.id} not marked failed: ${error.message}`,
    );
  }
  return AGENT_IN_OTHER_TENANT;
}
